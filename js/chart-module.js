

export function drawElevationChart(distanceData, elevationData, routeData) {
    let canvas = document.getElementById('elevationChart');
    canvas.style.backgroundColor = "#f2efe9";
    if (!canvas) {
        console.error('#elevationChart canvas not found');
        return;
    }
    if (typeof Chart === 'undefined') {
        console.error('Chart.js not loaded');
        return;
    }

    if (!Array.isArray(distanceData) || distanceData.length === 0) distanceData = [0, 1, 2, 3];
    if (!Array.isArray(elevationData) || elevationData.length === 0) elevationData = [100, 150, 120, 180];

    const ctx = canvas.getContext('2d');
    window.elevationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: routeData.map(function(p){
                return p.dist.toFixed(2);
            }),       
            datasets: [{
                label: 'Elevation (m)',
                data: routeData.map(function(p){return p.ele}),
                borderColor: '#14305F',
                backgroundColor: '#3c92d85b',
                fill: true,
                pointRadius: 1,
                tension: 0.25,
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const idx = context.dataIndex;
                            const elevs = context.dataset.data;
                            const dists = (context.chart.data.labels || []).map(Number);

                            const lines = [];
                            const curElev = elevs[idx];
                            lines.push(`Elevation: ${curElev == null ? 'n/a' : curElev.toFixed(0) + ' m'}`);

                            let grad = null;
                            if (idx > 0 && elevs[idx - 1] != null && !isNaN(dists[idx]) && !isNaN(dists[idx - 1])) {
                                const deltaH = curElev - elevs[idx - 1];
                                const deltaD = dists[idx] - dists[idx - 1]; // km
                                if (deltaD !== 0) grad = deltaH / deltaD; // m per km
                            } else if (idx < elevs.length - 1 && elevs[idx + 1] != null && !isNaN(dists[idx + 1]) && !isNaN(dists[idx])) {
                                const deltaH = elevs[idx + 1] - curElev;
                                const deltaD = dists[idx + 1] - dists[idx];
                                if (deltaD !== 0) grad = deltaH / deltaD;
                            }

                            if (grad == null || !isFinite(grad)) {
                                lines.push('Gradient: n/a');
                            } else {
                                const percent = grad / 10;
                                lines.push(`Gradient: ${grad.toFixed(1)} m/km (${percent.toFixed(2)}%)`);
                            }
                            return lines;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: Math.max(...distanceData),
                    ticks: {
                        callback: v => v.toFixed(1) + ' km'
                    },
                    title: { display: true, text: 'Distance (km)' }
                },
                y: { title: { display: true, text: 'Elevation (m)' } }
            }
        }
    });
}