# 🔬 Prism Optics Simulator

<div align="center">

![React](https://img.shields.io/badge/React-19.2.7-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-8.1.0-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![HTML5 Canvas](https://img.shields.io/badge/HTML5-Canvas%202D-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![Oxlint](https://img.shields.io/badge/Oxlint-Enabled-orange?style=for-the-badge)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)

<p align="center">
  <strong>Physics-Accurate Geometric Optics & Chromatic Dispersion Simulator</strong>
</p>

<p align="center">
  An interactive, real-time optical laboratory simulation built with React and HTML5 Canvas. Accurately simulates Snell's Law refraction, multi-bounce Total Internal Reflection (TIR), chromatic dispersion (rainbow spectrum), and angle of deviation telemetry.
</p>

</div>

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Optical Physics Engine](#-optical-physics-engine)
  - [Snell's Law](#1-snells-law-of-refraction)
  - [Total Internal Reflection (TIR)](#2-total-internal-reflection-tir)
  - [Chromatic Dispersion](#3-chromatic-dispersion--cauchy-relation)
  - [Angle of Deviation](#4-angle-of-deviation)
- [Interactive Controls](#-interactive-controls)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running Development Server](#running-development-server)
  - [Production Build](#production-build)
- [Preset Optical Media](#-preset-optical-media)
- [License](#-license)

---

## 🌟 Overview

The **Prism Optics Simulator** provides a visual and mathematical environment for exploring geometric optics. Whether for physics classrooms, optics engineering research, or curious learners, the application simulates the exact ray pathways taken by light as it passes through optical interfaces.

Users can manipulate a prism and a laser emitter in real time, observing how changing angles, media refractive indices, and light wavelengths alter refraction angles, emergence trajectories, and spectral separation.

---

## 🚀 Key Features

- **🎯 Interactive Direct Manipulation**:
  - Drag the prism anywhere on the canvas; rotate it smoothly using its apex handle.
  - Position the light emitter freely; pivot its directional beam handle to adjust incidence angles.
- **⚡ Multi-Bounce Total Internal Reflection**:
  - Realistic ray-tracing engine supporting up to 12 consecutive internal reflection bounces when the angle of incidence exceeds the critical angle ($\theta_c$).
- **🌈 Chromatic Dispersion & Rainbow Spectrum**:
  - Switch between monochromatic laser beams (selectable wavelength) and polychromatic white light that disperses into violet, blue, green, yellow, orange, and red spectrums.
- **📐 Real-Time Mathematical Telemetry**:
  - Live calculations for incident angle ($i$), refraction angles ($r_1, r_2$), emergence angle ($e$), total angle of deviation ($\delta$), and critical angle ($\theta_c$).
- **👁️ Layer Toggle Controls**:
  - Enable or disable surface normals, ray path vectors, angle measurement arcs, guide markers, and canvas gridlines.
- **💎 Material Presets & Custom Index**:
  - Quickly select real-world materials (Air, Water, Acrylic, Crown Glass, Flint Glass, Diamond) or fine-tune refractive index $n$ continuously.

---

## 🔬 Optical Physics Engine

```mermaid
flowchart LR
    Source["Laser / Light Emitter"] -->|Ray P + t*D| Surface1["Prism Interface 1 (Air -> Glass)"]
    Surface1 -->|Snell's Law: n1*sin(θ1) = n2*sin(θ2)| InternalRay["Internal Refracted Ray"]
    
    InternalRay --> CheckTIR{"Incident Angle > Critical Angle θc?"}
    CheckTIR -- Yes --> TIR["Total Internal Reflection (Multi-bounce up to 12x)"]
    TIR --> Surface2["Prism Interface 2"]
    CheckTIR -- No --> Surface2
    
    Surface2 -->|Snell's Law: n2*sin(r2) = n1*sin(e)| EmergentRay["Emergent Ray (Angle of Deviation δ)"]
    InternalRay -. Chromatic Mode .-> Dispersion["Wavelength Splitting (λ: 400nm - 700nm)"]
```

### 1. Snell's Law of Refraction
Light crossing a boundary between two isotropic media of refractive indices $n_1$ and $n_2$ satisfies:
$$n_1 \sin \theta_1 = n_2 \sin \theta_2$$

### 2. Total Internal Reflection (TIR)
When light moves from an optically denser medium ($n_2$) into a rarer medium ($n_1$) at an angle greater than the critical angle $\theta_c$, no refraction occurs; all energy reflects internally:
$$\theta_c = \arcsin\left(\frac{n_1}{n_2}\right)$$

### 3. Chromatic Dispersion (Cauchy Relation)
In dispersive media, the refractive index depends on the wavelength $\lambda$:
$$n(\lambda) = A + \frac{B}{\lambda^2}$$
Shorter wavelengths (violet $\approx 400\text{ nm}$) refract more strongly than longer wavelengths (red $\approx 700\text{ nm}$), producing the characteristic rainbow spectrum.

### 4. Angle of Deviation
For a triangular prism with apex angle $A$, the net deviation angle $\delta$ between incident and emergent rays is:
$$\delta = i + e - A$$

---

## 🎮 Interactive Controls

| Control | Action | Effect |
|:--------|:-------|:-------|
| **Prism Center Handle** | Click & Drag | Moves the prism across the 2D stage |
| **Prism Apex Handle** | Click & Rotate | Rotates prism orientation |
| **Laser Base** | Click & Drag | Translates the light source position |
| **Laser Aim Handle** | Click & Drag | Re-angles the incident ray direction |
| **Refractive Index Slider** | Drag slider | Changes media density ($n = 1.000$ to $2.500$) |
| **Apex Angle Slider** | Drag slider | Adjusts prism wedge angle ($30^\circ$ to $90^\circ$) |
| **Layer Toggles** | Checkboxes | Shows/hides normals, angle labels, ray paths, and grid |

---

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/)
- **Build Tool**: [Vite 8](https://vitejs.dev/)
- **Linter**: [Oxlint](https://oxc.rs/)
- **Graphics**: HTML5 2D Canvas rendering loop with hardware acceleration
- **Language**: Modern JavaScript (ES2023+)

---

## 📂 Project Structure

```
prism-optics-simulator/
├── public/
│   └── vite.svg                 # Static branding asset
├── src/
│   ├── assets/                  # Icons and images
│   ├── App.css                  # Simulator layout styling
│   ├── App.jsx                  # Main application wrapper
│   ├── index.css                # Base stylesheet and canvas sizing
│   ├── main.jsx                 # React root renderer
│   └── PrismSimulator.jsx       # Complete physics engine, UI controls & canvas loop
├── .oxlintrc.json               # Oxlint configuration
├── index.html                   # HTML5 canvas container
├── LICENSE                      # MIT License
├── package.json                 # Project dependencies and scripts
└── vite.config.js               # Vite plugin and build setup
```

---

## ⚙️ Getting Started

### Prerequisites

- **Node.js**: `v18.0.0` or higher (Node 20+ recommended)
- **npm**, **pnpm**, or **yarn**

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ShihabulSakib/prism-optics-simulator.git
   cd prism-optics-simulator
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running Development Server

Start Vite's development server with instant Hot Module Replacement (HMR):

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Production Build

To compile and bundle optimized static assets:

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

---

## 💎 Preset Optical Media

| Material | Refractive Index ($n$) | Description |
|:---------|:----------------------:|:------------|
| **Air** | $1.000$ | Standard atmospheric baseline |
| **Water** | $1.333$ | Clean liquid optical medium |
| **Acrylic (PMMA)** | $1.491$ | Common lightweight optical polymer |
| **Crown Glass** | $1.523$ | Low-dispersion optical glass standard |
| **Flint Glass** | $1.650$ | High-dispersion optical glass (strong rainbow) |
| **Diamond** | $2.417$ | Extreme refractive index and dispersion |

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
