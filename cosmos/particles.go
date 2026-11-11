package main

import "math"

func append32(out []float32, values ...float64) []float32 {
	for _, v := range values {
		out = append(out, float32(v))
	}
	return out
}
func galaxyParticles(systems []*system, count int) []float32 {
	rnd := random(20261110)
	data := make([]float32, 0, count*11)
	type wave struct {
		k          vec
		phase, amp float64
	}
	waves := []wave{}
	for i := 0; i < 7; i++ {
		waves = append(waves, wave{scale(unit(rnd), mix(2, 5.5, rnd())), rnd() * tau, mix(0.05, 0.13, rnd())})
	}
	bulge := palette([]string{"#ffe2b8", "#ffcf95", "#fff2dc"})
	young := palette([]string{"#c8d8ff", "#e2ebff", "#a9c2ff"})
	old := palette([]string{"#fff1dc", "#ffe0bd", "#f2f2f2"})
	hii := linear("#ff7aa0")
	pick := func(list []vec) vec { return list[int(rnd()*float64(len(list)))] }
	for i := 0; i < count; i++ {
		p, col, size := vec{}, old[0], 1.0
		for attempt := 0; attempt < 8; attempt++ {
			kind := rnd()
			if kind < 0.16 {
				r := math.Abs(gauss(rnd))*620 + rnd()*140
				d := unit(rnd)
				p = vec{d[0] * r, d[1] * r * 0.6, d[2] * r}
				col = pick(bulge)
				size = 0.6 + math.Pow(rnd(), 3)*1.6
			} else if kind < 0.8 {
				arm := int(rnd() * 4)
				major := arm%2 == 0
				r := galaxyRadius * (0.09 + 0.91*math.Pow(rnd(), choose(major, 0.9, 0.75)))
				theta := float64(arm)*(tau/4) + math.Log(r/420)*2.7
				spread := choose(major, 0.15, 0.25) * (1 + 0.6*(1-r/galaxyRadius))
				a := theta + gauss(rnd)*spread
				rr := r + gauss(rnd)*90
				p = vec{math.Cos(a) * rr, gauss(rnd) * (70 - 35*(r/galaxyRadius)), math.Sin(a) * rr}
				roll := rnd()
				if roll < 0.06 {
					col = hii
				} else if roll < 0.62 {
					col = pick(young)
				} else {
					col = pick(old)
				}
				size = 0.55 + math.Pow(rnd(), 3)*2.4 + choose(roll < 0.06, 0.6, 0.0)
			} else {
				r := galaxyRadius * math.Sqrt(rnd()) * 1.05
				a := rnd() * tau
				p = vec{math.Cos(a) * r, gauss(rnd) * 110 * (1 - 0.5*(r/galaxyRadius)), math.Sin(a) * r}
				col = pick(old)
				size = 0.45 + math.Pow(rnd(), 4)*1.4
			}
			avoid := false
			for _, sys := range systems {
				if length(sub(p, sys.Center)) <= sys.Extent+160 {
					avoid = true
					break
				}
			}
			if !avoid {
				break
			}
		}
		l := length(p) + 60
		dir := norm(vec{p[0] + gauss(rnd)*l*0.55, p[1] + gauss(rnd)*l*0.9, p[2] + gauss(rnd)*l*0.55})
		k := 1.0
		for _, w := range waves {
			k += w.amp * math.Cos(dot(dir, w.k)+w.phase)
		}
		reach := l*(1.05+0.5*rnd())*k + 300*rnd()
		brightness := mix(0.65, 1.25, rnd())
		phase := rnd()
		data = append32(data, p[0], p[1], p[2], dir[0]*reach, dir[1]*reach, dir[2]*reach, phase, col[0]*brightness, col[1]*brightness, col[2]*brightness, size)
	}
	return data
}
func skyParticles(count int) []float32 {
	rnd := random(7)
	tints := palette([]string{"#ffffff", "#cfdcff", "#ffe8cc", "#ffd2a8", "#b8ccff"})
	data := make([]float32, 0, count*7)
	for i := 0; i < count; i++ {
		d := unit(rnd)
		c := tints[int(rnd()*float64(len(tints)))]
		b := mix(0.25, 0.9, rnd())
		data = append32(data, d[0]*30000, d[1]*30000, d[2]*30000, c[0]*b, c[1]*b, c[2]*b, 0.45+math.Pow(rnd(), 5)*1.6)
	}
	return data
}
func beltParticles(sys *system, count int) []float32 {
	rnd := random(hash(sys.ID + ":belt"))
	tints := palette([]string{"#b8a58f", "#8f877d", "#d1c2ad"})
	data := make([]float32, 0, count*7)
	for i := 0; i < count; i++ {
		a := rnd() * tau
		r := mix(sys.Belt.Inner, sys.Belt.Outer, math.Pow(rnd(), 0.8))
		h := gauss(rnd) * 1.4
		base := orbitPoint(sys, r, a, 0, 0)
		c := tints[int(rnd()*float64(len(tints)))]
		b := mix(0.18, 0.5, rnd())
		p := add(base, scale(sys.Normal, h))
		data = append32(data, p[0], p[1], p[2], c[0]*b, c[1]*b, c[2]*b, 0.5+rnd()*0.9)
	}
	return data
}

var nebulaMasks = [4][4]float64{{1, 0, 0, 0}, {0, 1, 0, 0}, {0, 0, 1, 0}, {0, 0, 0, 1}}

func appendNebula(data []float32, pos vec, size float64, c1, c2 string, intensity, rot float64, mask int) []float32 {
	a, b := linear(c1), linear(c2)
	data = append32(data, pos[0], pos[1], pos[2], size, a[0], a[1], a[2], intensity, b[0], b[1], b[2], rot)
	return append32(data, nebulaMasks[mask][:]...)
}
func galaxyNebulae(systems []*system, count int) []float32 {
	rnd := random(31337)
	type tint struct {
		a, b   string
		weight float64
	}
	colors := []tint{{"#ff5c7a", "#ff9a6a", 0.4}, {"#5f86ff", "#9fc4ff", 0.25}, {"#9a6bff", "#ff7ad0", 0.15}, {"#3fd0c8", "#7a9cff", 0.1}, {"#ffb06a", "#ff6a5a", 0.1}}
	data := make([]float32, 0, (count+2)*16)
	for i := 0; i < count; i++ {
		arm := int(rnd() * 4)
		r := galaxyRadius * mix(0.18, 0.98, math.Pow(rnd(), 0.8))
		a := float64(arm)*(tau/4) + math.Log(r/420)*2.7 + gauss(rnd)*0.14
		roll := rnd()
		choice := colors[0]
		for _, entry := range colors {
			roll -= entry.weight
			if roll <= 0 {
				choice = entry
				break
			}
		}
		pos := vec{math.Cos(a) * r, gauss(rnd) * 50, math.Sin(a) * r}
		size := mix(380, 1500, math.Pow(rnd(), 1.6))
		intensity := mix(0.05, 0.13, rnd())
		rot := rnd() * tau
		mask := int(rnd() * 3)
		data = appendNebula(data, pos, size, choice.a, choice.b, intensity, rot, mask)
	}
	data = appendNebula(data, vec{}, 2600, "#ffd29a", "#ffe8c8", 0.12, 0.3, 0)
	data = appendNebula(data, vec{}, 1200, "#fff0d8", "#ffd6a0", 0.2, 1.7, 0)
	for _, sys := range systems {
		if sys.Nebula {
			data = appendNebula(data, sys.Center, sys.Extent*1.15, "#5ff2d6", "#ff5a4a", 0.45, 0.4, 3)
			data = appendNebula(data, sys.Center, sys.Extent*1.8, "#ff4a5e", "#6a7cff", 0.07, 1.2, 1)
		}
	}
	return data
}
func blastClouds() []float32 {
	rnd := random(99)
	colors := [][2]string{{"#ffffff", "#bcd2ff"}, {"#ffd6a0", "#ff8a4a"}, {"#ff8a5a", "#ff4a6a"}, {"#a8c0ff", "#ffffff"}}
	data := []float32{}
	for i := 0; i < 14; i++ {
		c := colors[int(rnd()*float64(len(colors)))]
		pos := scale(unit(rnd), mix(0.05, 0.55, rnd()))
		size := mix(0.35, 0.9, rnd())
		intensity := mix(0.25, 0.6, rnd())
		rot := rnd() * tau
		mask := int(rnd() * 3)
		data = appendNebula(data, pos, size, c[0], c[1], intensity, rot, mask)
	}
	return data
}
func orbitLines(systems []*system) (data []float32, routeStart, routeCount int) {
	for _, sys := range systems {
		for _, p := range sys.Planets {
			p.OrbitStart = len(data) / 4
			for s := 0; s <= orbitSegments; s++ {
				a := float64(s) / orbitSegments * tau
				v := orbitPoint(sys, p.A, a, p.Incl, p.Node)
				data = append32(data, v[0], v[1], v[2], a)
			}
		}
	}
	routeStart = len(data) / 4
	distance := 0.0
	var last *vec
	for i := 0; i < len(systems)-1; i++ {
		p0, p1, p2, p3 := systems[max(0, i-1)].Center, systems[i].Center, systems[i+1].Center, systems[min(len(systems)-1, i+2)].Center
		for s := 0; s < 32; s++ {
			t := float64(s) / 32
			t2, t3 := t*t, t*t*t
			var p vec
			for k := range p {
				p[k] = 0.5 * (2*p1[k] + (p2[k]-p0[k])*t + (2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2 + (3*p1[k]-p0[k]-3*p2[k]+p3[k])*t3)
			}
			if last != nil {
				distance += length(sub(p, *last))
			}
			data = append32(data, p[0], p[1], p[2], distance)
			last = &p
		}
	}
	if len(systems) > 0 {
		p := systems[len(systems)-1].Center
		if last != nil {
			distance += length(sub(p, *last))
		}
		data = append32(data, p[0], p[1], p[2], distance)
	}
	return data, routeStart, len(data)/4 - routeStart
}
