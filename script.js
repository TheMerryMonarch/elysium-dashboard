const API_BASE = "http://127.0.0.1:8000";

const tempSpan = document.getElementById("temp-value");
const timeSpan = document.getElementById("temp-time");

let tempChart;
let chartData = {
  labels: [],
  temps: []
};

async function fetchLatest() {
  try {
    const res = await fetch(`${API_BASE}/latest`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data) return;

    const temp = data.temperature_f;
    const ts = new Date(data.timestamp);

    tempSpan.textContent = temp.toFixed(2);
    timeSpan.textContent = ts.toLocaleString();
  } catch (err) {
    console.error("Error fetching latest:", err);
  }
}

async function fetchHistory() {
  try {
    const res = await fetch(`${API_BASE}/history`);
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data)) return;

    chartData.labels = data.map(d => new Date(d.timestamp));
    chartData.temps = data.map(d => d.temperature_f);

    renderChart();
  } catch (err) {
    console.error("Error fetching history:", err);
  }
}

function renderChart() {
  const ctx = document.getElementById("tempChart").getContext("2d");

  if (tempChart) {
    tempChart.data.labels = chartData.labels.map(d =>
      d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    );
    tempChart.data.datasets[0].data = chartData.temps;
    tempChart.update();
    return;
  }

  tempChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: chartData.labels.map(d =>
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      ),
      datasets: [
        {
          label: "Temperature (°F)",
          data: chartData.temps,
          tension: 0.3,
          pointRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: {
          ticks: { maxTicksLimit: 8 }
        },
        y: {
          beginAtZero: false
        }
      }
    }
  });
}

async function refreshAll() {
  await Promise.all([fetchLatest(), fetchHistory()]);
}

// initial load
refreshAll();
// refresh every 10 seconds
setInterval(refreshAll, 10000);

