package main

import (
	"math"
	"strconv"
	"unicode/utf16"
)

const tau = math.Pi * 2
const galaxyRadius = 5200
const orbitSegments = 192

type vec [3]float64

func add(a, b vec) vec           { return vec{a[0] + b[0], a[1] + b[1], a[2] + b[2]} }
func sub(a, b vec) vec           { return vec{a[0] - b[0], a[1] - b[1], a[2] - b[2]} }
func scale(a vec, s float64) vec { return vec{a[0] * s, a[1] * s, a[2] * s} }
func dot(a, b vec) float64       { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2] }
func cross(a, b vec) vec {
	return vec{a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]}
}
func length(a vec) float64 { return math.Sqrt(dot(a, a)) }
func norm(a vec) vec {
	l := length(a)
	if l == 0 {
		l = 1
	}
	return scale(a, 1/l)
}
func mix(a, b, t float64) float64 { return a + (b-a)*t }
func lerp(a, b vec, t float64) vec {
	return vec{mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)}
}
func clamp(x, a, b float64) float64  { return math.Min(b, math.Max(a, x)) }
func smooth(a, b, x float64) float64 { t := clamp((x-a)/(b-a), 0, 1); return t * t * (3 - 2*t) }
func smoother(t float64) float64     { return t * t * t * (t*(t*6-15) + 10) }
func ease(t float64) float64 {
	if t < 0.5 {
		return 4 * t * t * t
	}
	return 1 - math.Pow(-2*t+2, 3)/2
}
func mod(x, n float64) float64 { return math.Mod(math.Mod(x, n)+n, n) }
func choose[T any](condition bool, a, b T) T {
	if condition {
		return a
	}
	return b
}

// Match JavaScript's Math.imul overflow and UTF-16 string hashing exactly.
func random(seed uint32) func() float64 {
	a := seed
	return func() float64 {
		a += 0x6d2b79f5
		t := (a ^ (a >> 15)) * (1 | a)
		t = (t + (t^(t>>7))*(61|t)) ^ t
		return float64(t^(t>>14)) / 4294967296
	}
}
func hash(s string) uint32 {
	h := uint32(2166136261)
	for _, c := range utf16.Encode([]rune(s)) {
		h ^= uint32(c)
		h *= 16777619
	}
	return h
}
func gauss(rnd func() float64) float64 {
	u := rnd()
	for u == 0 {
		u = rnd()
	}
	return math.Sqrt(-2*math.Log(u)) * math.Cos(tau*rnd())
}
func unit(rnd func() float64) vec {
	z := rnd()*2 - 1
	a := rnd() * tau
	r := math.Sqrt(1 - z*z)
	return vec{r * math.Cos(a), z, r * math.Sin(a)}
}
func linear(hex string) vec {
	n, _ := strconv.ParseUint(hex[1:], 16, 32)
	var v vec
	for i, shift := range []uint{16, 8, 0} {
		x := float64((n>>shift)&255) / 255
		if x <= 0.04045 {
			v[i] = x / 12.92
		} else {
			v[i] = math.Pow((x+0.055)/1.055, 2.4)
		}
	}
	return v
}
