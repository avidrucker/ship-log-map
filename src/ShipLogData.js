const initialGraph = {
  nodes: [
    { id: "timber_hearth", title: "Timber Hearth", state: "complete", x: 100, y: 300 },
    { id: "observatory", title: "Observatory", state: "complete", x: 300, y: 300 },
    { id: "quantum_moon", title: "Quantum Moon", state: "rumor", x: 500, y: 200 },
    { id: "tower_of_quantum_trials", title: "Tower of Quantum Trials", state: "undiscovered", x: 700, y: 200 },
    { id: "white_hole_station", title: "White Hole Station", state: "rumor", x: 500, y: 400 },
    { id: "high_energy_lab", title: "High Energy Lab", state: "undiscovered", x: 700, y: 400 },
    { id: "sun_station", title: "Sun Station", state: "rumor", x: 300, y: 500 },
    { id: "ash_twin_project", title: "Ash Twin Project", state: "undiscovered", x: 500, y: 500 },
    { id: "nomai_writing_1", title: "Nomai Writing: Quantum Objects", state: "complete", x: 900, y: 200 },
    { id: "nomai_writing_2", title: "Nomai Writing: Warp Experiments", state: "rumor", x: 900, y: 400 },
    { id: "giants_deep", title: "Giant's Deep", state: "rumor", x: 300, y: 700 },
    { id: "orbital_probe_cannon", title: "Orbital Probe Cannon", state: "undiscovered", x: 500, y: 700 },
    { id: "dark_bramble", title: "Dark Bramble", state: "rumor", x: 700, y: 700 },
    { id: "nomai_escape_pod", title: "Nomai Escape Pod", state: "undiscovered", x: 900, y: 700 },
    { id: "vessel", title: "The Vessel", state: "undiscovered", x: 1100, y: 700 }
  ],
  edges: [
    { source: "observatory", target: "quantum_moon", type: "rumor" },
    { source: "quantum_moon", target: "tower_of_quantum_trials", type: "rumor" },
    { source: "observatory", target: "white_hole_station", type: "rumor" },
    { source: "white_hole_station", target: "high_energy_lab", type: "rumor" },
    { source: "high_energy_lab", target: "ash_twin_project", type: "rumor" },
    { source: "observatory", target: "sun_station", type: "rumor" },
    { source: "sun_station", target: "ash_twin_project", type: "rumor" },
    { source: "observatory", target: "giants_deep", type: "rumor" },
    { source: "giants_deep", target: "orbital_probe_cannon", type: "rumor" },
    { source: "observatory", target: "dark_bramble", type: "rumor" },
    { source: "dark_bramble", target: "vessel", type: "rumor" },
    { source: "nomai_escape_pod", target: "vessel", type: "direct" },
    { source: "nomai_writing_1", target: "tower_of_quantum_trials", type: "direct" },
    { source: "nomai_writing_2", target: "high_energy_lab", type: "direct" }
  ]
};

export default initialGraph;
