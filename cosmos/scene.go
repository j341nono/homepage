package main

import (
	_ "embed"
	"encoding/json"
	"math"
)

//go:embed config.json
var configJSON []byte

type starType struct {
	Hex       string  `json:"hex"`
	Radius    float64 `json:"radius"`
	Class     string  `json:"cls"`
	Intensity float64 `json:"intensity"`
}
type style struct {
	Star      string `json:"star"`
	Planets   int    `json:"planets,omitempty"`
	Home      bool   `json:"home,omitempty"`
	Belt      bool   `json:"belt,omitempty"`
	Companion string `json:"companion,omitempty"`
	Rings     bool   `json:"rings,omitempty"`
	Nebula    bool   `json:"nebula,omitempty"`
}
type config struct {
	StarTypes     map[string]starType
	SystemStyles  map[string]style
	FallbackStars []string
	PlanetKinds   map[string]int
	Palettes      map[string][][]string
	Atmospheres   map[string][]json.RawMessage
	RingColors    []string
}

var design = func() config {
	var c config
	if err := json.Unmarshal(configJSON, &c); err != nil {
		panic(err)
	}
	return c
}()

type descriptor struct {
	ID    string `json:"id"`
	Count int    `json:"count"`
	Moons []int  `json:"moons"`
	Side  string `json:"side"`
}
type star struct {
	Type      starType `json:"type"`
	Offset    float64  `json:"offset"`
	Phase     float64  `json:"phase"`
	Color     vec      `json:"color"`
	Radius    float64  `json:"radius"`
	Intensity float64  `json:"intensity"`
	Position  vec      `json:"position"`
	Seed      float64  `json:"seed"`
}
type ring struct {
	Inner  float64 `json:"inner"`
	Outer  float64 `json:"outer"`
	Color  vec     `json:"color"`
	Normal vec     `json:"normal"`
	Seed   float64 `json:"seed"`
}
type moon struct {
	A        float64 `json:"a"`
	Radius   float64 `json:"radius"`
	Phase    float64 `json:"phase"`
	Speed    float64 `json:"speed"`
	Incl     float64 `json:"incl"`
	Palette  []vec   `json:"palette"`
	Seed     float64 `json:"seed"`
	Position vec     `json:"position"`
}
type planet struct {
	Kind               string  `json:"kind"`
	Type               int     `json:"type"`
	A                  float64 `json:"a"`
	Radius             float64 `json:"radius"`
	Phase              float64 `json:"phase"`
	Speed              float64 `json:"speed"`
	Incl               float64 `json:"incl"`
	Node               float64 `json:"node"`
	Tilt               float64 `json:"tilt"`
	SpinSpeed          float64 `json:"spinSpeed"`
	Palette            []vec   `json:"palette"`
	Atmosphere         vec     `json:"atmosphere"`
	AtmosphereStrength float64 `json:"atmosphereStrength"`
	Ring               *ring   `json:"ring"`
	Moons              []*moon `json:"moons"`
	Seed               float64 `json:"seed"`
	Angle              float64 `json:"angle"`
	Position           vec     `json:"position"`
	Highlight          float64 `json:"highlight"`
	HighlightTarget    float64 `json:"highlightTarget"`
	OrbitStart         int     `json:"orbitStart"`
}
type belt struct {
	Inner float64 `json:"inner"`
	Outer float64 `json:"outer"`
	Speed float64 `json:"speed"`
}
type system struct {
	ID          string    `json:"id"`
	Side        string    `json:"side"`
	Style       style     `json:"style"`
	Center      vec       `json:"center"`
	Normal      vec       `json:"normal"`
	U           vec       `json:"u"`
	V           vec       `json:"v"`
	Stars       []*star   `json:"stars"`
	Planets     []*planet `json:"planets"`
	Belt        *belt     `json:"belt"`
	Extent      float64   `json:"extent"`
	LightColor  vec       `json:"lightColor"`
	Nebula      bool      `json:"nebula"`
	BinarySpeed float64   `json:"binarySpeed"`
	StarHex     string    `json:"starHex"`
	Az0         float64   `json:"az0"`
	Dir         float64   `json:"dir"`
	Sweep       float64   `json:"sweep"`
}

func palette(hex []string) []vec {
	out := make([]vec, len(hex))
	for i, s := range hex {
		out[i] = linear(s)
	}
	return out
}
func generateSystems(input []descriptor) []*system {
	systems := make([]*system, 0, len(input))
	for index, d := range input {
		st, ok := design.SystemStyles[d.ID]
		if !ok {
			st.Star = design.FallbackStars[index%len(design.FallbackStars)]
		}
		rnd := random(hash(d.ID) ^ 0x9e3779b9)
		count := d.Count
		if count == 0 {
			count = st.Planets
		}
		if count == 0 {
			count = 3
		}
		count = int(clamp(float64(count), 1, 12))
		t := 0.0
		if len(input) > 1 {
			t = float64(index) / float64(len(input)-1)
		}
		angle := 0.6 + float64(index)*0.36
		r := mix(4300, 1650, t)
		center := vec{math.Cos(angle) * r, 70 * math.Sin(float64(index)*1.9), math.Sin(angle) * r}
		normal := norm(vec{(rnd() - 0.5) * 0.36, 1, (rnd() - 0.5) * 0.36})
		u := norm(cross(normal, vec{0, 0, 1}))
		v := cross(normal, u)
		primary := design.StarTypes[st.Star]
		stars := []*star{}
		inner := 0.0
		if st.Companion != "" {
			companion := design.StarTypes[st.Companion]
			sep := (primary.Radius + companion.Radius) * 2.3
			total := primary.Radius + companion.Radius
			stars = append(stars, &star{Type: primary, Offset: sep * companion.Radius / total}, &star{Type: companion, Offset: sep * primary.Radius / total, Phase: math.Pi})
			inner = sep*2.4 + 12
		} else {
			stars = append(stars, &star{Type: primary})
			inner = primary.Radius*3.4 + 10
		}
		for _, s := range stars {
			s.Color = linear(s.Type.Hex)
			s.Radius = s.Type.Radius
			s.Intensity = s.Type.Intensity
			s.Position = center
			s.Seed = rnd()
		}
		planets := []*planet{}
		a := inner
		for j := 0; j < count; j++ {
			f := 0.5
			if count > 1 {
				f = float64(j) / float64(count-1)
			}
			kind := "ice"
			if f < 0.34 {
				kind = "rocky"
			} else if f < 0.72 {
				kind = "gas"
			}
			if count <= 2 {
				kind = choose(j == 0, "rocky", "gas")
			}
			if st.Home && j == 2 {
				kind = "terran"
			} else if kind == "rocky" && j == 0 && !st.Home && rnd() < 0.55 {
				kind = "lava"
			}
			if st.Rings && kind == "ice" && rnd() < 0.5 {
				kind = "gas"
			}
			size := 2.15
			switch kind {
			case "gas":
				size = mix(3.2, 5.4, rnd())
			case "ice":
				size = mix(2.2, 3.1, rnd())
			case "terran":
			default:
				size = mix(1, 1.9, rnd())
			}
			palettes := design.Palettes[kind]
			pal := palette(palettes[int(rnd()*float64(len(palettes)))])
			tilt := (rnd() - 0.5) * choose(kind == "gas", 0.9, 0.6)
			var rings *ring
			if kind == "gas" && (st.Rings || rnd() < 0.3) {
				rings = &ring{Inner: size * 1.35, Outer: size * mix(2.1, 2.55, rnd()), Color: linear(design.RingColors[int(rnd()*float64(len(design.RingColors)))]), Normal: vec{0, math.Cos(tilt), math.Sin(tilt)}, Seed: rnd()}
			}
			moonCount := 0
			if j < len(d.Moons) {
				moonCount = d.Moons[j]
			}
			if moonCount == 0 {
				if kind == "terran" {
					moonCount = 1
				} else if kind == "gas" && rnd() < 0.45 {
					moonCount = 1 + int(rnd()*2)
				}
			}
			edge := size
			if rings != nil {
				edge = rings.Outer
			}
			reach := edge + float64(moonCount)*1.7
			if moonCount > 0 {
				reach += 2
			}
			a += reach
			if j > 0 {
				a += mix(5, 9, rnd())
			}
			moons := []*moon{}
			for m := 0; m < moonCount; m++ {
				moons = append(moons, &moon{A: edge + 1.6 + float64(m)*1.7, Radius: mix(0.32, 0.62, rnd()), Phase: rnd() * tau, Speed: 0.55 / (1 + float64(m)*0.6), Incl: (rnd() - 0.5) * 0.4, Palette: palette(design.Palettes["rocky"][1]), Seed: rnd()})
			}
			var atm string
			var strength float64
			_ = json.Unmarshal(design.Atmospheres[kind][0], &atm)
			_ = json.Unmarshal(design.Atmospheres[kind][1], &strength)
			planets = append(planets, &planet{Kind: kind, Type: design.PlanetKinds[kind], A: a, Radius: size, Phase: rnd() * tau, Speed: 0.16 * math.Pow(inner/a, 1.5), Incl: (rnd() - 0.5) * 0.07, Node: rnd() * tau, Tilt: tilt, SpinSpeed: mix(0.05, 0.22, rnd()) * choose(kind == "gas", 1.6, 1.0), Palette: pal, Atmosphere: linear(atm), AtmosphereStrength: strength, Ring: rings, Moons: moons, Seed: rnd()})
			a += reach
		}
		maxRadius := 0.0
		for _, s := range stars {
			maxRadius = math.Max(maxRadius, s.Radius)
		}
		extent := math.Max(a+8, maxRadius*14+30)
		var b *belt
		if st.Belt {
			b = &belt{Inner: extent + 4, Outer: extent + 18, Speed: 0.012 + rnd()*0.01}
			extent += 22
		}
		systems = append(systems, &system{ID: d.ID, Side: d.Side, Style: st, Center: center, Normal: normal, U: u, V: v, Stars: stars, Planets: planets, Belt: b, Extent: extent, LightColor: lerp(vec{1, 1, 1}, stars[0].Color, 0.55), Nebula: st.Nebula, BinarySpeed: 0.09, StarHex: primary.Hex, Dir: 1, Sweep: 1.95})
	}
	planOrbits(systems, false)
	return systems
}
func orbitPoint(sys *system, a, angle, incl, node float64) vec {
	c, s := math.Cos(angle), math.Sin(angle)
	h := a * incl * math.Sin(angle-node)
	return add(sys.Center, add(scale(sys.U, a*c), add(scale(sys.V, a*s), scale(sys.Normal, h))))
}
func updateBodies(systems []*system, time float64, values []float64) []float64 {
	values = values[:0]
	for _, sys := range systems {
		for _, s := range sys.Stars {
			if s.Offset != 0 {
				s.Position = orbitPoint(sys, s.Offset, s.Phase+time*sys.BinarySpeed, 0, 0)
			}
			values = append(values, s.Position[:]...)
		}
		for _, p := range sys.Planets {
			p.Angle = mod(p.Phase+time*p.Speed, tau)
			p.Position = orbitPoint(sys, p.A, p.Angle, p.Incl, p.Node)
			values = append(values, p.Angle)
			values = append(values, p.Position[:]...)
			for _, m := range p.Moons {
				angle := m.Phase + time*m.Speed
				c, s := math.Cos(angle), math.Sin(angle)
				h := math.Sin(angle) * m.Incl
				m.Position = add(p.Position, scale(add(scale(sys.U, c), add(scale(sys.V, s), scale(sys.Normal, h))), m.A))
				values = append(values, m.Position[:]...)
			}
		}
	}
	return values
}
