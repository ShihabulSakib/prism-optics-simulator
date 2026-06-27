# Prism Simulation

A physics-based interactive light prism simulation built using React and Vite. This project simulates the refraction of light through glass prisms, showing dispersion (rainbow effect), reflection, and total internal reflection depending on the angle of incidence and index of refraction.

## Features

- **Interactive Laser & Prism Control**: Position, rotate, and adjust properties of the light source and the prism.
- **Physical Light Simulation**: Accurate ray-tracing of light through media interfaces using Snell's Law.
- **Wavelength Dispersion**: Simulates chromatic dispersion where different wavelengths (colors) of light refract at slightly different angles, splitting white light into a rainbow spectrum.
- **Interactive UI Controls**: Adjust index of refraction, angle of incidence, light wavelength, beam width, and prism shapes.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/simulation.git
   cd simulation
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:5173](http://localhost:5173) in your browser to view the simulator.

### Building for Production

To build the project for production, run:
```bash
npm run build
```

## License

This project is licensed under the MIT License - see the [LICENSE](file:///root/simulation/LICENSE) file for details.
