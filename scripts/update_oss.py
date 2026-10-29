"""Refresh only GitHub-owned OSS metadata; publish nothing on partial failure."""

from __future__ import annotations

import argparse
import copy
from http.client import HTTPException
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import time
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zoneinfo import ZoneInfo

import yaml


class UpdateError(Exception):
    """A safe-to-log failure (never contains response bodies or credentials)."""


class NoRedirects(HTTPRedirectHandler):
    # Do not forward Authorization to a redirect target. Renames need review.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class GitHubClient:
    def __init__(self, token):
        if not token:
            raise UpdateError("GITHUB_TOKEN is required.")
        self.token = token
        self.opener = build_opener(NoRedirects())

    def get(self, path):
        request = Request(
            "https://api.github.com" + path,
            headers={
                "Authorization": "Bearer " + self.token,
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "homepage-oss-updater",
            },
        )
        for attempt in range(3):
            try:
                with self.opener.open(request, timeout=30) as response:
                    payload = json.load(response)
                if not isinstance(payload, dict):
                    raise UpdateError("GitHub returned a non-object JSON response.")
                return payload
            except HTTPError as error:
                status = error.code
                error.close()
                if status in (403, 429):
                    raise UpdateError("GitHub denied access or rate limited the request; deployment stopped.") from None
                if status < 500 or attempt == 2:
                    raise UpdateError(f"GitHub API HTTP {status}; deployment stopped.") from None
            except (URLError, TimeoutError, OSError, HTTPException):
                if attempt == 2:
                    raise UpdateError("GitHub API network failure; deployment stopped.") from None
            except (ValueError, UnicodeError):
                raise UpdateError("GitHub returned invalid JSON; deployment stopped.") from None
            time.sleep(2 ** attempt)


def refresh(data, fetch, checked_at):
    """Return a complete snapshot, preserving all fields outside our allowlist."""
    result = copy.deepcopy(data)
    if not isinstance(result, dict) or not isinstance(result.get("projects"), list) or not result["projects"]:
        raise UpdateError("OSS data must contain a nonempty projects list.")
    for project in result["projects"]:
        if not isinstance(project, dict) or not re.fullmatch(
            r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", str(project.get("repo", ""))
        ):
            raise UpdateError("Invalid OSS repository identifier.")
        repo_path = "/repos/" + project["repo"]
        repository = fetch(repo_path)
        stars = repository.get("stargazers_count")
        if type(stars) is not int or stars < 0:
            raise UpdateError("GitHub returned an invalid star count.")
        project["stars"] = stars
        if not isinstance(project.get("items"), list):
            raise UpdateError("OSS project must contain an items list.")
        for item in project["items"]:
            if (not isinstance(item, dict) or item.get("type") not in ("issue", "pr")
                    or type(item.get("number")) is not int or item["number"] <= 0):
                raise UpdateError("Invalid OSS item type or number.")
            kind = "pulls" if item["type"] == "pr" else "issues"
            payload = fetch(f"{repo_path}/{kind}/{item['number']}")
            state, title = payload.get("state"), payload.get("title")
            if (type(payload.get("number")) is not int or payload["number"] != item["number"]
                    or state not in ("open", "closed")
                    or not isinstance(title, str) or not title.strip()):
                raise UpdateError("GitHub returned invalid item metadata.")
            merged_at = None
            if item["type"] == "issue":
                if "pull_request" in payload:
                    raise UpdateError("An OSS issue entry points to a pull request.")
            else:
                if "merged_at" not in payload:
                    raise UpdateError("GitHub PR response is missing merged_at.")
                merged_at = payload["merged_at"]
                if merged_at is not None:
                    if (not isinstance(merged_at, str) or not re.fullmatch(
                            r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", merged_at)):
                        raise UpdateError("GitHub returned an invalid merge timestamp.")
                    try:
                        datetime.fromisoformat(merged_at.replace("Z", "+00:00"))
                    except ValueError:
                        raise UpdateError("GitHub returned an invalid merge timestamp.") from None
                    if state != "closed":
                        raise UpdateError("GitHub returned inconsistent PR merge metadata.")
            item["status"] = "merged" if merged_at is not None else state
            item["github_title"] = title
            item["checked_at"] = checked_at
            if merged_at is not None:
                item["merged_at"] = merged_at
            else:
                item.pop("merged_at", None)
    result["checked_at"] = checked_at
    return result


def update_file(path, fetch, checked_at):
    """Replace the YAML atomically only after every request and validation passes."""
    try:
        original = yaml.safe_load(path.read_text(encoding="utf-8"))
        updated = refresh(original, fetch, checked_at)
        rendered = yaml.safe_dump(updated, allow_unicode=True, sort_keys=False)
        if yaml.safe_load(rendered) != updated:
            raise UpdateError("Updated YAML did not round-trip correctly.")
    except yaml.YAMLError:
        raise UpdateError("Invalid OSS YAML; no data written.") from None
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         delete=False) as output:
            temporary = Path(output.name)
            output.write(rendered)
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path("_data/oss.yml"))
    args = parser.parse_args(argv)
    try:
        client = GitHubClient(os.environ.get("GITHUB_TOKEN"))
        checked_at = datetime.now(ZoneInfo("Asia/Tokyo")).date().isoformat()
        update_file(args.data, client.get, checked_at)
    except (UpdateError, OSError, UnicodeError) as error:
        # OS exceptions may include sensitive paths; only our own errors are logged.
        message = str(error) if isinstance(error, UpdateError) else "Unable to read or write OSS data."
        print(f"OSS update failed: {message}", file=sys.stderr)
        return 1
    print("OSS metadata refreshed successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
