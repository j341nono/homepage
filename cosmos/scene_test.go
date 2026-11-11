package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"testing"
)

// Captured from the JavaScript renderer before migration. Includes every star
// style, a Unicode fallback ID, nested moons, and the 12-planet limit.
type reference struct {
	Descriptors   []descriptor
	Systems       json.RawMessage
	CameraSamples []struct {
		Kind     string
		Index    int
		Portrait bool
		P        float64
		Value    struct {
			Pos, Target vec
			Fov         float64
			Shift       [2]float64
		}
	}
	TimeSamples []struct {
		Time   float64
		Values []float64
	}
	Particles map[string]struct {
		Length  int
		Indices []int
		Values  []float64
	}
	RouteStart, RouteCount int
}

func loadReference(t *testing.T) reference {
	t.Helper()
	data, err := os.ReadFile("testdata/javascript.json")
	if err != nil {
		t.Fatal(err)
	}
	var r reference
	if err = json.Unmarshal(data, &r); err != nil {
		t.Fatal(err)
	}
	return r
}
func closeNumber(t *testing.T, path string, actual, expected, tolerance float64) {
	t.Helper()
	if math.IsNaN(actual) || math.IsInf(actual, 0) || math.Abs(actual-expected) > tolerance*math.Max(1, math.Abs(expected)) {
		t.Fatalf("%s: got %.16g, want %.16g", path, actual, expected)
	}
}
func compareJSON(t *testing.T, path string, actual, expected any) {
	t.Helper()
	switch e := expected.(type) {
	case float64:
		a, ok := actual.(float64)
		if !ok {
			t.Fatalf("%s: expected number", path)
		}
		closeNumber(t, path, a, e, 1e-10)
	case map[string]any:
		a, ok := actual.(map[string]any)
		if !ok {
			t.Fatalf("%s: expected object", path)
		}
		for k, v := range e {
			compareJSON(t, path+"."+k, a[k], v)
		}
	case []any:
		a, ok := actual.([]any)
		if !ok || len(a) != len(e) {
			t.Fatalf("%s: array length mismatch", path)
		}
		for i, v := range e {
			compareJSON(t, fmt.Sprintf("%s[%d]", path, i), a[i], v)
		}
	default:
		if actual != expected {
			t.Fatalf("%s: got %v, want %v", path, actual, expected)
		}
	}
}
func TestSceneMatchesJavaScript(t *testing.T) {
	r := loadReference(t)
	systems := generateSystems(r.Descriptors)
	data, _ := json.Marshal(systems)
	var actual, expected any
	_ = json.Unmarshal(data, &actual)
	_ = json.Unmarshal(r.Systems, &expected)
	compareJSON(t, "systems", actual, expected)
	for _, sample := range r.TimeSamples {
		got := updateBodies(systems, sample.Time, nil)
		if len(got) != len(sample.Values) {
			t.Fatal("body count differs")
		}
		for i, v := range sample.Values {
			closeNumber(t, fmt.Sprintf("time %g body[%d]", sample.Time, i), got[i], v, 1e-9)
		}
	}
}
func TestCameraMatchesJavaScript(t *testing.T) {
	r := loadReference(t)
	systems := generateSystems(r.Descriptors)
	for _, sample := range r.CameraSamples {
		t.Run(fmt.Sprintf("%s/portrait=%t/p=%g", sample.Kind, sample.Portrait, sample.P), func(t *testing.T) {
			l := layout{Portrait: sample.Portrait, Narrow: sample.Portrait}
			var got shot
			switch sample.Kind {
			case "hero":
				got = heroShot(sample.P, l.Portrait)
			case "outro":
				got = outroShot(sample.P, l.Portrait)
			case "system":
				got = systemShot(systems[sample.Index], sample.P, l)
			case "transit":
				got = transitShot(systems, l, sample.Index, sample.P)
			}
			for i := 0; i < 3; i++ {
				closeNumber(t, "position", got.Pos[i], sample.Value.Pos[i], 1e-9)
				closeNumber(t, "target", got.Target[i], sample.Value.Target[i], 1e-9)
			}
			closeNumber(t, "FOV", got.Fov, sample.Value.Fov, 1e-12)
			for i := 0; i < 2; i++ {
				closeNumber(t, "lens shift", got.Shift[i], sample.Value.Shift[i], 1e-12)
			}
		})
	}
}
func TestParticlesMatchJavaScript(t *testing.T) {
	r := loadReference(t)
	systems := generateSystems(r.Descriptors)
	lines, start, count := orbitLines(systems)
	if start != r.RouteStart || count != r.RouteCount {
		t.Fatal("route offsets differ")
	}
	buffers := map[string][]float32{"galaxy": galaxyParticles(systems, 96000), "sky": skyParticles(9000), "belt": beltParticles(systems[3], 2600), "nebula": galaxyNebulae(systems, 72), "blast": blastClouds(), "lines": lines}
	for name, want := range r.Particles {
		t.Run(name, func(t *testing.T) {
			data := buffers[name]
			if len(data) != want.Length {
				t.Fatalf("got %d floats, want %d", len(data), want.Length)
			}
			for i, index := range want.Indices {
				closeNumber(t, fmt.Sprintf("%s[%d]", name, index), float64(data[index]), want.Values[i], 1e-6)
			}
		})
	}
}
func TestCameraLayoutAndReducedMotion(t *testing.T) {
	systems := generateSystems([]descriptor{{ID: "profile", Side: "left"}})
	l := layout{Stops: []stop{{0, 100}, {200, 300}, {400, 500}}}
	for _, scroll := range []float64{0, 50, 100, 150, 200, 250, 300, 350, 400, 500} {
		got := cameraAt(systems, l, scroll, -1, 0)
		for _, v := range append(got.Pos[:], got.Target[:]...) {
			if math.IsNaN(v) || math.IsInf(v, 0) {
				t.Fatalf("invalid camera at %g", scroll)
			}
		}
	}
	before := cameraAt(systems, l, 10, 0, 0)
	after := cameraAt(systems, l, 60, 0, 100)
	if before.Bang != 0 || after.Bang != 1 {
		t.Fatal("reduced motion hero must switch between still frames")
	}
	a := cameraAt(systems, l, 250, 1, 0)
	b := cameraAt(systems, l, 250, 1, 100)
	if a != b {
		t.Fatal("reduced motion camera must not sway with time")
	}
	if cameraAt(systems, l, 500, 2, 0).Outro != 1 {
		t.Fatal("outro still frame must be fully formed")
	}
}
