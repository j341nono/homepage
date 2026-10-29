from __future__ import annotations

import copy
from http.client import IncompleteRead
from io import BytesIO, StringIO
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError

import yaml

from scripts.update_oss import GitHubClient, NoRedirects, UpdateError, main, refresh, update_file


ROOT = Path(__file__).resolve().parents[1]
DATE = "2026-10-29"
MERGED = "2026-10-28T12:34:56Z"


class OSSUpdateTest(unittest.TestCase):
    def setUp(self):
        self.data = {
            "checked_at": "2026-10-01", "custom": {"keep": True},
            "projects": [{
                "name": "Example", "repo": "owner/repo", "stars": 1,
                "summary": {"ja": "手動の要約", "en": "Manual summary"},
                "links": [{"label": "Docs", "url": "https://example.com"}],
                "custom": ["keep", 42],
                "items": [{
                    "type": "pr", "number": 2, "status": "merged",
                    "github_title": "Old title", "merged_at": MERGED,
                    "title": {"ja": "翻訳", "en": "Edited title"},
                    "custom": {"nested": "keep"},
                }],
            }],
        }
        self.payload = {"number": 2, "state": "open", "title": "New GitHub title", "merged_at": None}
        self.fetch = Mock(side_effect=lambda path: (
            {"stargazers_count": 1234} if path == "/repos/owner/repo" else self.payload
        ))

    def updated_item(self):
        return refresh(self.data, self.fetch, DATE)["projects"][0]["items"][0]

    def test_stars_and_checked_dates(self):
        updated = refresh(self.data, self.fetch, DATE)
        self.assertEqual(updated["projects"][0]["stars"], 1234)
        self.assertEqual(updated["checked_at"], DATE)
        self.assertEqual(updated["projects"][0]["items"][0]["checked_at"], DATE)
        self.fetch.assert_any_call("/repos/owner/repo/pulls/2")

    def test_issue_states_and_stale_merge_removal(self):
        self.data["projects"][0]["items"][0]["type"] = "issue"
        self.payload.pop("merged_at")
        for state in ("open", "closed"):
            with self.subTest(state=state):
                self.payload["state"] = state
                updated = self.updated_item()
                self.assertEqual(updated["status"], state)
                self.assertNotIn("merged_at", updated)
        self.fetch.assert_any_call("/repos/owner/repo/issues/2")

    def test_pr_states_and_merge_timestamp(self):
        for state, merged_at, expected in (
            ("open", None, "open"), ("closed", None, "closed"), ("closed", MERGED, "merged")
        ):
            with self.subTest(state=state, merged_at=merged_at):
                self.payload.update(state=state, merged_at=merged_at)
                updated = self.updated_item()
                self.assertEqual(updated["status"], expected)
                self.assertEqual(updated.get("merged_at"), merged_at)
                self.assertEqual("merged_at" in updated, merged_at is not None)

    def test_manual_fields_order_and_input_preserved(self):
        self.data["projects"].append(copy.deepcopy(self.data["projects"][0]))
        self.data["projects"][1]["name"] = "Second project"
        before = copy.deepcopy(self.data)
        updated = refresh(self.data, self.fetch, DATE)
        self.assertEqual(self.data, before)
        for key in ("name", "repo", "summary", "links", "custom"):
            self.assertEqual([p[key] for p in updated["projects"]], [p[key] for p in before["projects"]])
        item = updated["projects"][0]["items"][0]
        for key in ("title", "number", "type", "custom"):
            self.assertEqual(item[key], before["projects"][0]["items"][0][key])
        self.assertEqual(item["github_title"], "New GitHub title")
        self.assertEqual(updated["custom"], before["custom"])

    def test_invalid_merge_metadata_rejected(self):
        for state, merged_at in (("open", MERGED), ("closed", "yesterday"),
                                 ("closed", "2026-02-30T12:00:00Z"), ("closed", False)):
            with self.subTest(state=state, merged_at=merged_at):
                self.payload.update(state=state, merged_at=merged_at)
                with self.assertRaises(UpdateError):
                    self.updated_item()
        self.payload.pop("merged_at")
        with self.assertRaises(UpdateError):
            self.updated_item()

    def test_invalid_api_fields_rejected(self):
        for key, value in (("state", "unknown"), ("title", None), ("title", ""), ("number", 99)):
            with self.subTest(key=key, value=value):
                payload = dict(self.payload, **{key: value})
                fetch = lambda path: {"stargazers_count": 2} if path == "/repos/owner/repo" else payload
                with self.assertRaises(UpdateError):
                    refresh(self.data, fetch, DATE)
        for stars in (-1, True, "123", None):
            with self.subTest(stars=stars), self.assertRaises(UpdateError):
                refresh(self.data, lambda path: {"stargazers_count": stars}, DATE)

    def test_issue_cannot_point_to_pr(self):
        self.data["projects"][0]["items"][0]["type"] = "issue"
        self.payload["pull_request"] = {}
        with self.assertRaises(UpdateError):
            self.updated_item()

    def test_invalid_input_rejected(self):
        for data in (None, {}, {"projects": []}, {"projects": [None]},
                     {"projects": [{"repo": "owner/repo?token=secret"}]}):
            with self.subTest(data=data), self.assertRaises(UpdateError):
                refresh(data, self.fetch, DATE)
        self.data["projects"][0]["items"][0]["type"] = "other"
        with self.assertRaises(UpdateError):
            self.updated_item()

    def test_atomic_failure_keeps_file_byte_for_byte(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "oss.yml"
            original = "# Preserve even comments on failure\n" + yaml.safe_dump(self.data, allow_unicode=True)
            path.write_text(original, encoding="utf-8")
            for error in (UpdateError("404"), UpdateError("Invalid JSON"), UpdateError("Rate limited")):
                # Fail after the star request succeeded, so partial writes are detected.
                fetch = Mock(side_effect=[{"stargazers_count": 9999}, error])
                with self.subTest(error=str(error)), self.assertRaises(UpdateError):
                    update_file(path, fetch, DATE)
                self.assertEqual(path.read_text(encoding="utf-8"), original)
                self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_yaml_round_trip_and_idempotence(self):
        self.payload["title"] = '日本語: "title"\n<&> # tagged'
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "oss.yml"
            path.write_text(yaml.safe_dump(self.data, allow_unicode=True), encoding="utf-8")
            update_file(path, self.fetch, DATE)
            once = path.read_bytes()
            parsed = yaml.safe_load(once)
            self.assertEqual(parsed, refresh(self.data, self.fetch, DATE))
            self.assertIsInstance(parsed["checked_at"], str)
            update_file(path, self.fetch, DATE)
            self.assertEqual(path.read_bytes(), once)

    def test_invalid_yaml_is_not_replaced(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "oss.yml"
            path.write_text("projects: [", encoding="utf-8")
            with self.assertRaises(UpdateError):
                update_file(path, self.fetch, DATE)
            self.assertEqual(path.read_text(), "projects: [")
            self.fetch.assert_not_called()

    def test_all_registered_items_can_be_refreshed_offline(self):
        data = yaml.safe_load((ROOT / "_data/oss.yml").read_text())
        calls = []

        def fetch(path):
            calls.append(path)
            if path.count("/") == 3:
                return {"stargazers_count": 42}
            number = int(path.rsplit("/", 1)[1])
            return {"number": number, "title": "Mock title", "state": "closed", "merged_at": MERGED}

        updated = refresh(data, fetch, DATE)
        self.assertEqual(len(calls), sum(1 + len(p["items"]) for p in data["projects"]))
        for original, project in zip(data["projects"], updated["projects"]):
            self.assertEqual(project["summary"], original["summary"])
            self.assertEqual(project["stars"], 42)
            for old_item, item in zip(original["items"], project["items"]):
                self.assertEqual(item["title"], old_item["title"])
                self.assertEqual(item["status"], "merged" if item["type"] == "pr" else "closed")


class GitHubClientTest(unittest.TestCase):
    def setUp(self):
        self.client = GitHubClient("secret-token")
        self.client.opener = Mock()

    def response(self, data):
        response = Mock()
        response.__enter__ = Mock(return_value=BytesIO(data))
        response.__exit__ = Mock(return_value=False)
        return response

    def test_authenticated_request(self):
        self.client.opener.open.return_value = self.response(b'{"stargazers_count": 12}')
        self.assertEqual(self.client.get("/repos/owner/repo"), {"stargazers_count": 12})
        args, kwargs = self.client.opener.open.call_args
        self.assertEqual(args[0].full_url, "https://api.github.com/repos/owner/repo")
        self.assertEqual(args[0].get_header("Authorization"), "Bearer secret-token")
        self.assertEqual(kwargs["timeout"], 30)

    def test_bad_json_rejected(self):
        for body in (b"bad secret-token", b"[]", b"null", b"\xff"):
            self.client.opener.open.return_value = self.response(body)
            with self.subTest(body=body), self.assertRaises(UpdateError) as caught:
                self.client.get("/repos/owner/repo")
            self.assertNotIn("secret-token", str(caught.exception))

    @patch("scripts.update_oss.time.sleep")
    def test_http_failures(self, sleep):
        for status in (301, 401, 403, 404, 429, 500, 503):
            self.client.opener.open.reset_mock()
            def fail(*args, **kwargs):
                raise HTTPError("https://api.github.com", status, "secret-token", {}, BytesIO(b"secret-token"))
            self.client.opener.open.side_effect = fail
            with self.subTest(status=status), self.assertRaises(UpdateError) as caught:
                self.client.get("/repos/owner/repo")
            self.assertNotIn("secret-token", str(caught.exception))
            self.assertEqual(self.client.opener.open.call_count, 3 if status >= 500 else 1)

    @patch("scripts.update_oss.time.sleep")
    def test_network_retries_then_fails(self, sleep):
        for error in (URLError("secret-token"), TimeoutError("secret-token"),
                      OSError("secret-token"), IncompleteRead(b"secret-token")):
            self.client.opener.open.reset_mock()
            self.client.opener.open.side_effect = error
            with self.subTest(error=type(error)), self.assertRaises(UpdateError) as caught:
                self.client.get("/repos/owner/repo")
            self.assertEqual(self.client.opener.open.call_count, 3)
            self.assertNotIn("secret-token", str(caught.exception))

    @patch("scripts.update_oss.time.sleep")
    def test_transient_failure_can_recover(self, sleep):
        self.client.opener.open.side_effect = [URLError("offline"), self.response(b'{"ok":true}')]
        self.assertEqual(self.client.get("/repos/owner/repo"), {"ok": True})
        sleep.assert_called_once_with(1)

    def test_redirects_do_not_forward_credentials(self):
        self.assertIsNone(NoRedirects().redirect_request(None, None, 301, "", {}, "https://other.test"))

    @patch.dict(os.environ, {"GITHUB_TOKEN": ""})
    def test_cli_missing_token_fails_without_exposing_data(self):
        with patch("sys.stderr", new_callable=StringIO) as stderr:
            self.assertEqual(main([]), 1)
        self.assertIn("GITHUB_TOKEN is required", stderr.getvalue())

    @patch.dict(os.environ, {"GITHUB_TOKEN": "secret-token"})
    @patch("scripts.update_oss.update_file", side_effect=UpdateError("GitHub API HTTP 404"))
    def test_cli_api_failure_is_nonzero(self, update):
        with patch("sys.stderr", new_callable=StringIO) as stderr:
            self.assertEqual(main([]), 1)
        self.assertNotIn("secret-token", stderr.getvalue())


class PagesWorkflowTest(unittest.TestCase):
    def test_push_schedule_dispatch_share_refresh_build_deploy_path(self):
        # BaseLoader preserves the YAML 1.2 Actions key `on` as a string.
        workflow = yaml.load((ROOT / ".github/workflows/deploy-pages.yml").read_text(), Loader=yaml.BaseLoader)
        events = workflow["on"]
        self.assertEqual(events["push"]["branches"], ["main"])
        self.assertNotIn("paths", events["push"])
        self.assertEqual(events["schedule"][0]["cron"], "17 3 1-31/2 * *")
        self.assertIn("workflow_dispatch", events)
        build = workflow["jobs"]["build"]
        self.assertEqual(build["if"], "github.ref == 'refs/heads/main'")
        steps = build["steps"]
        refresh_index = next(i for i, s in enumerate(steps) if s.get("run") == "python scripts/update_oss.py")
        build_index = next(i for i, s in enumerate(steps) if "jekyll build" in s.get("run", ""))
        upload_index = next(i for i, s in enumerate(steps) if "upload-pages-artifact" in s.get("uses", ""))
        self.assertLess(refresh_index, build_index)
        self.assertLess(build_index, upload_index)
        self.assertEqual(steps[refresh_index]["env"]["GITHUB_TOKEN"], "${{ github.token }}")
        for step in steps:
            self.assertNotIn("if", step)  # Refresh cannot be bypassed on push or schedule.
            self.assertNotIn("continue-on-error", step)
            self.assertNotIn("git push", step.get("run", ""))
            self.assertNotIn("git commit", step.get("run", ""))
        deploy = workflow["jobs"]["deploy"]
        self.assertEqual(deploy["needs"], "build")
        self.assertNotIn("if", deploy)  # Default success() gate keeps the old site on failure.
        self.assertEqual(build["permissions"], {"contents": "read", "pages": "read"})
        self.assertEqual(deploy["permissions"], {"pages": "write", "id-token": "write"})
        self.assertEqual(workflow["concurrency"], {"group": "pages", "cancel-in-progress": "false"})


@unittest.skipUnless(os.environ.get("OSS_TEST_JEKYLL") == "1", "Set OSS_TEST_JEKYLL=1 to test the Jekyll build")
class JekyllIntegrationTest(unittest.TestCase):
    def test_refreshed_snapshot_renders_in_both_languages(self):
        original = (ROOT / "_data/oss.yml").read_bytes()
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source"
            destination = Path(directory) / "site"
            shutil.copytree(ROOT, source, ignore=shutil.ignore_patterns(
                ".git", "_site", "vendor", ".venv", ".bundle", ".jekyll-cache", "__pycache__"
            ))
            path = source / "_data/oss.yml"
            data = yaml.safe_load(path.read_text())
            payloads = {}
            for project in data["projects"]:
                base = "/repos/" + project["repo"]
                payloads[base] = {"stargazers_count": 987654}
                for index, item in enumerate(project["items"]):
                    kind = "pulls" if item["type"] == "pr" else "issues"
                    status = ("open", "closed", "merged")[index % 3] if kind == "pulls" else ("open", "closed")[index % 2]
                    payloads[f"{base}/{kind}/{item['number']}"] = {
                        "number": item["number"], "title": 'GitHub <snapshot> "quoted"',
                        "state": "closed" if status == "merged" else status,
                        "merged_at": MERGED if status == "merged" else None,
                    }
            update_file(path, payloads.__getitem__, "2099-01-01")
            updated = yaml.safe_load(path.read_text())
            built = subprocess.run(
                ["bundle", "exec", "jekyll", "build", "--source", str(source),
                 "--destination", str(destination), "--baseurl", "/homepage"],
                cwd=ROOT, env={**os.environ, "JEKYLL_ENV": "production"},
                capture_output=True, text=True, timeout=120,
            )
            self.assertEqual(built.returncode, 0, built.stdout + built.stderr)
            locales = yaml.safe_load((ROOT / "_data/locales.yml").read_text())
            for language, page in (("ja", "index.html"), ("en", "en/index.html")):
                html = (destination / page).read_text()
                self.assertIn("987654 GitHub stars", html)
                self.assertIn('title="GitHub &lt;snapshot&gt; &quot;quoted&quot;"', html)
                self.assertNotIn("2099-01-01", html)
                for project in updated["projects"]:
                    self.assertIn(project["summary"][language], html)
                    for item in project["items"]:
                        kind = "pull" if item["type"] == "pr" else "issues"
                        url = f'https://github.com/{project["repo"]}/{kind}/{item["number"]}'
                        match = re.search(re.escape(url) + r'"[^>]*>.*?</a>\s*<span class="oss-status oss-status--(\w+)">([^<]+)</span>', html)
                        self.assertIsNotNone(match, url)
                        self.assertEqual(match.group(1), item["status"])
                        labels = "statuses" if item["type"] == "pr" else "issue_statuses"
                        self.assertEqual(match.group(2), locales[language]["oss"][labels][item["status"]])
            for excluded in ("scripts", "tests", "docs", "requirements-oss.txt"):
                self.assertFalse((destination / excluded).exists(), excluded)
        self.assertEqual((ROOT / "_data/oss.yml").read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
