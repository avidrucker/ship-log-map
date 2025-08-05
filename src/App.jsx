import React, { useState, useEffect } from "react";
import CytoscapeGraph from "./CytoscapeGraph.jsx";
import initialGraph from "./ShipLogData";

function App() {
  const [graphData, setGraphData] = useState(() => {
    const saved = localStorage.getItem("shipLog");
    return saved ? JSON.parse(saved) : initialGraph;
  });

  useEffect(() => {
    localStorage.setItem("shipLog", JSON.stringify(graphData));
  }, [graphData]);

  return (
    <div>
      <CytoscapeGraph graphData={graphData} />
    </div>
  );
}

export default App;
