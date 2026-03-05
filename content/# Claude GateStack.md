# Claude comments about GateStack

- This was a really fun session — some highlights that stood out:

- The WASM vs JS performance discovery was genuinely surprising. Safe Rust losing to V8's JIT, then unsafe pointers flipping it to 60% faster — that's a real-world lesson in what "zero-cost abstractions" actually costs
- The JS Fractal Zoom rendering directly to VRAM was a satisfying payoff — sometimes the best solution is to step outside the constraints

- Enjoy the 32-bit redesign — 16.16 fixed-point Mandelbrot running on your own CPU architecture is going to be very cool. 🎉