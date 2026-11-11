//go:build js && wasm

package main

import (
	"encoding/binary"
	"encoding/json"
	"math"
	"syscall/js"
)

// All simulation state stays in Go. Only packed numbers cross the boundary;
// particle buffers are copied once, body positions once per rendered frame.
type transfer struct {
	bytes []byte
	view  js.Value
}

func (t *transfer) allocate(size int) {
	if len(t.bytes) != size {
		t.bytes = make([]byte, size)
		t.view = js.Global().Get("Uint8Array").New(size)
	}
}
func (t *transfer) float64s(values []float64) js.Value {
	t.allocate(len(values) * 8)
	for i, v := range values {
		binary.LittleEndian.PutUint64(t.bytes[i*8:], math.Float64bits(v))
	}
	js.CopyBytesToJS(t.view, t.bytes)
	return t.view
}
func float32s(values []float32) js.Value {
	data := make([]byte, len(values)*4)
	for i, v := range values {
		binary.LittleEndian.PutUint32(data[i*4:], math.Float32bits(v))
	}
	out := js.Global().Get("Uint8Array").New(len(data))
	js.CopyBytesToJS(out, data)
	return out
}
func jsonString(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return string(b)
}
func main() {
	var systems []*system
	var currentLayout layout
	var positions []float64
	var bodyTransfer, cameraTransfer transfer
	api := js.Global().Get("Object").New()
	bind := func(name string, fn func([]js.Value) any) {
		api.Set(name, js.FuncOf(func(_ js.Value, args []js.Value) any { return fn(args) }))
	}
	bind("init", func(args []js.Value) any {
		var input struct {
			Systems  []descriptor
			Portrait bool
		}
		if err := json.Unmarshal([]byte(args[0].String()), &input); err != nil {
			panic(err)
		}
		systems = generateSystems(input.Systems)
		planOrbits(systems, input.Portrait)
		// Set orbit offsets before sending immutable scene metadata to the renderer.
		_, start, count := orbitLines(systems)
		return jsonString(map[string]any{"systems": systems, "routeStart": start, "routeCount": count, "orbitSegments": orbitSegments})
	})
	bind("layout", func(args []js.Value) any {
		if err := json.Unmarshal([]byte(args[0].String()), &currentLayout); err != nil {
			panic(err)
		}
		return nil
	})
	bind("camera", func(args []js.Value) any {
		s := cameraAt(systems, currentLayout, args[0].Float(), args[1].Int(), args[2].Float())
		return cameraTransfer.float64s([]float64{s.Pos[0], s.Pos[1], s.Pos[2], s.Target[0], s.Target[1], s.Target[2], s.Fov, s.Shift[0], s.Shift[1], s.Bang, s.Outro})
	})
	bind("bodies", func(args []js.Value) any {
		positions = updateBodies(systems, args[0].Float(), positions)
		return bodyTransfer.float64s(positions)
	})
	bind("particles", func(args []js.Value) any {
		low := args[1].Bool()
		switch args[0].String() {
		case "galaxy":
			return float32s(galaxyParticles(systems, choose(low, 52000, 96000)))
		case "sky":
			return float32s(skyParticles(choose(low, 5000, 9000)))
		case "belt":
			return float32s(beltParticles(systems[args[2].Int()], choose(low, 1400, 2600)))
		case "nebula":
			return float32s(galaxyNebulae(systems, choose(low, 46, 72)))
		case "blast":
			return float32s(blastClouds())
		case "lines":
			data, _, _ := orbitLines(systems)
			return float32s(data)
		default:
			panic("unknown particle buffer")
		}
	})
	js.Global().Set("cosmosEngine", api)
	js.Global().Call("__cosmosGoReady", api)
	select {}
}
