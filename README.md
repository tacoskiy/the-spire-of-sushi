# The Spire of 寿司

*A hand-controlled sushi stacking game.*

---

## Overview

**The Spire of 寿司** is a physics-based stacking game controlled entirely by your hands.  
Using a PC camera and real-time hand tracking, players **grab, move, and place sushi** to build the tallest possible spire.

No mouse.  
No keyboard.  
Your hands *are* the controller.

---

## Core Concept

- The player’s hand is detected via a webcam
- Pinching your fingers **grabs** a piece of sushi
- Releasing your fingers **drops** it into the stack
- The goal is to stack sushi as high and as stably as possible
- If the tower collapses, the game ends

The game focuses on **physical interaction**, **balance**, and **tension created by instability**.

---

## Game Modes

### Normal Mode

- Standard sushi pieces
- Stable and beginner-friendly
- Ideal for building a solid foundation

### Wasabi Mode

A high-risk, high-reward variant.

- Special *Wasabi Sushi* appears
- Wasabi sushi is **much thinner and harder to balance**
- Successfully placing it yields higher scores

---

## Sushi Size Rules

| Type | Width | Characteristics |
|-----|------|-----------------|
| Normal Sushi | 3 units | Stable, good foundation |
| Wasabi Sushi | 1.5 units | Unstable, high score potential |

Thinner sushi naturally forms a **spire shape**, reinforcing the game’s theme.

---

## Controls

| Hand Action | In-Game Action |
|------------|---------------|
| Pinch fingers | Grab sushi |
| Release fingers | Drop sushi |
| Move hand | Move sushi |

The controls are designed to be **self-explanatory**, with no tutorial required.

---

## Technology Stack

### Frontend
- **Next.js** (App Router)
- TypeScript

### Hand Tracking
- **MediaPipe Hands**
  - Real-time hand and finger detection
  - Runs directly in the browser

### Rendering & Physics
- **Three.js** (3D rendering)
- **Rapier Physics** (WASM-based physics engine)
  - Stable stacking
  - Kinematic → Dynamic body switching

---

## Physics Design

- Sushi pieces are:
  - *Kinematic* while being held
  - Switched to *Dynamic* when released
- Low restitution (minimal bounce)
- High friction and damping for realistic stacking behavior

This ensures a tactile, weighty feel suitable for precise stacking.

---

## Scoring (Concept)

- Normal sushi: base score
- Wasabi sushi: higher score
- Height-based bonuses
- Risk-reward balance encourages skillful play

---

## Design Philosophy

- **Hands-first interaction**
- Minimal UI, maximum clarity
- Difficulty emerges from physics, not rules
- Visually readable danger (thin sushi = risky)

---

## Why “寿司” in Kanji?

- Sushi is globally recognizable
- Kanji functions as a visual symbol
- Creates strong contrast with English text
- Reinforces the game’s identity and aesthetic

Display name:
> **The Spire of 寿司**

Internal / search-friendly name:
> **The Spire of SUSHI**

---

## Status

This project is currently in active development.

The initial goal is a polished, playable **web-based prototype** showcasing:

- Hand-tracked interaction
- Physics-based stacking
- A clear and unique game identity

---

## License

This project is licensed under the **MIT License**.

This repository is intended as a **technical prototype and portfolio project**.  
The game concept, mechanics, and assets may change in the future.
