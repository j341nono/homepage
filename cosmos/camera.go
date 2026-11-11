package main

import "math"

type shot struct {
	Pos, Target vec
	Fov         float64
	Shift       [2]float64
	Bang, Outro float64
}
type stop struct{ R, D float64 }
type layout struct {
	Stops            []stop
	Portrait, Narrow bool
}

func spherical(el, az, d float64) vec {
	return vec{math.Cos(el) * math.Cos(az) * d, math.Sin(el) * d, math.Cos(el) * math.Sin(az) * d}
}
func heroShot(p float64, portrait bool) shot {
	e := smooth(0.045, 0.62, p)
	blast := 1 - math.Pow(1-e, 2.6)
	d := 120 + 1.45*blast*4300
	d = mix(d, 15500*choose(portrait, 1.65, 1.0), ease(smooth(0.45, 1, p)))
	el := mix(0.06, 0.66, smooth(0.2, 1, p))
	az := -0.4 + mix(-0.35, 0.55, p)
	return shot{Pos: spherical(el, az, d), Fov: choose(portrait, 62.0, 50.0), Shift: [2]float64{0, mix(0.24, 0.12, smooth(0.3, 1, p))}}
}
func systemShot(sys *system, p float64, l layout) shot {
	e := sys.Extent * choose(l.Portrait, 1.45, 1.0)
	az := sys.Az0 + sys.Dir*sys.Sweep*p
	el := mix(0.52, 0.27, p)
	d := e * mix(1.9, 1.32, ease(p))
	shift := [2]float64{choose(sys.Side == "left", 0.4, -0.4), 0.02}
	if l.Narrow {
		shift = [2]float64{0, 0.48}
	}
	return shot{Pos: add(sys.Center, spherical(el, az, d)), Target: sys.Center, Fov: choose(l.Portrait, 60.0, 44.0), Shift: shift}
}
func outroShot(p float64, portrait bool) shot {
	d := mix(17000, 19500, p) * choose(portrait, 1.7, 1.0)
	el := mix(0.92, 1.18, p)
	az := 1.9 + p*0.25
	return shot{Pos: spherical(el, az, d), Fov: choose(portrait, 62.0, 48.0), Shift: [2]float64{0, 0.2}}
}
func planOrbits(systems []*system, portrait bool) {
	heroEnd := heroShot(1, portrait).Pos
	for i, sys := range systems {
		prev := heroEnd
		if i > 0 {
			prev = systems[i-1].Center
		}
		next := outroShot(0, portrait).Pos
		if i < len(systems)-1 {
			next = systems[i+1].Center
		}
		toPrev := math.Atan2(prev[2]-sys.Center[2], prev[0]-sys.Center[0])
		toNext := math.Atan2(next[2]-sys.Center[2], next[0]-sys.Center[0])
		diff := func(x float64) float64 { return math.Abs(math.Mod(math.Mod(x-toNext, tau)+tau+math.Pi, tau) - math.Pi) }
		sys.Az0 = toPrev + choose(i%2 != 0, 0.45, -0.45)
		sys.Dir = choose(diff(sys.Az0+sys.Sweep) <= diff(sys.Az0-sys.Sweep), 1.0, -1.0)
	}
}
func stopShot(systems []*system, l layout, index int, p float64) shot {
	if index == 0 {
		return heroShot(p, l.Portrait)
	}
	if index == len(systems)+1 {
		return outroShot(p, l.Portrait)
	}
	return systemShot(systems[index-1], p, l)
}
func transitShot(systems []*system, l layout, index int, t float64) shot {
	a1 := stopShot(systems, l, index-1, 1)
	a0 := stopShot(systems, l, index-1, 0.985)
	b0 := stopShot(systems, l, index, 0)
	b1 := stopShot(systems, l, index, 0.015)
	p0, p3 := a1.Pos, b0.Pos
	d := length(sub(p3, p0))
	if d == 0 {
		d = 1
	}
	lift := vec{0, d * 0.1, 0}
	p1 := add(add(p0, scale(norm(sub(a1.Pos, a0.Pos)), d*0.38)), lift)
	p2 := add(sub(p3, scale(norm(sub(b1.Pos, b0.Pos)), d*0.38)), lift)
	te := mix(t, smoother(t), 0.65)
	k := 1 - te
	var pos, vel vec
	for i := range pos {
		pos[i] = k*k*k*p0[i] + 3*k*k*te*p1[i] + 3*k*te*te*p2[i] + te*te*te*p3[i]
		vel[i] = 3*k*k*(p1[i]-p0[i]) + 6*k*te*(p2[i]-p1[i]) + 3*te*te*(p3[i]-p2[i])
	}
	s := smoother(t)
	bump := math.Pow(math.Sin(math.Pi*t), 2)
	look := add(pos, scale(norm(vel), d*0.5))
	return shot{Pos: pos, Target: lerp(lerp(a1.Target, b0.Target, s), look, bump*0.75), Fov: mix(a1.Fov, b0.Fov, s) + bump*12, Shift: [2]float64{mix(a1.Shift[0], b0.Shift[0], s) * (1 - 0.7*bump), mix(a1.Shift[1], b0.Shift[1], s) * (1 - 0.7*bump)}}
}
func locate(l layout, scroll float64) (index int, transit bool, p float64) {
	for i, s := range l.Stops {
		if scroll <= s.D || i == len(l.Stops)-1 {
			if scroll >= s.R || i == 0 {
				return i, false, clamp((scroll-s.R)/(s.D-s.R), 0, 1)
			}
			prev := l.Stops[i-1]
			return i, true, clamp((scroll-prev.D)/(s.R-prev.D), 0, 1)
		}
	}
	return len(l.Stops) - 1, false, 1
}
func cameraAt(systems []*system, l layout, scroll float64, stillIndex int, time float64) shot {
	var out shot
	if stillIndex >= 0 {
		p := 0.5
		if stillIndex == 0 {
			p = choose(scroll > l.Stops[0].D*0.5, 1.0, 0.0)
		}
		out = stopShot(systems, l, stillIndex, p)
		out.Bang = 1
		if stillIndex == 0 {
			out.Bang = p
		}
		if stillIndex == len(l.Stops)-1 {
			out.Outro = 1
		}
		return out
	}
	index, transit, p := locate(l, scroll)
	if transit {
		out = transitShot(systems, l, index, p)
	} else {
		out = stopShot(systems, l, index, p)
	}
	out.Bang = 1
	if index == 0 && !transit {
		out.Bang = p
	}
	if index == len(l.Stops)-1 {
		if transit {
			out.Outro = smooth(0.5, 1, p) * 0.4
		} else {
			out.Outro = p
		}
	}
	sway := length(sub(out.Pos, out.Target)) * 0.0025
	out.Pos = add(out.Pos, vec{math.Sin(time*0.31) * sway, math.Sin(time*0.23+1) * sway, math.Cos(time*0.27) * sway})
	return out
}
