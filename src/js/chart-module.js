import { isMapPanning }
from "./map-module.js";
import { Source, setIndex, getPlaying }
from "./controller-module.js";
import { getCamps }
from "./itinerary-module.js";

const PINE = '#283f32';
const RUST = 'rgba(162, 92, 58, 0.45)';

// dashed vertical line + name at every camp
const campLines = {
    id: 'campLines',
    afterDatasetsDraw(chart) {
        const { ctx, chartArea } = chart;
        const points = chart.getDatasetMeta(0).data;
        ctx.save();
        ctx.strokeStyle = 'rgba(40, 63, 50, 0.55)';
        ctx.fillStyle = PINE;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.font = '600 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        getCamps().forEach(camp => {
            const pt = points[camp.index];
            if (!pt) return;
            ctx.beginPath();
            ctx.moveTo(pt.x, chartArea.top + 14);
            ctx.lineTo(pt.x, chartArea.bottom);
            ctx.stroke();
            ctx.fillText(camp.name, pt.x, chartArea.top + 10);
        });
        ctx.restore();
    }
};

let progressData = [];
let progressIndex = -1;

// rust fill under the profile from the start to index (mutated in place)
export function setChartProgress(index) {
    const chart = window.elevationChart;
    if (!chart || index === progressIndex) return;
    const source = chart.data.datasets[0].data;
    const from = Math.min(index, progressIndex) + 1;
    const to = Math.max(index, progressIndex);
    for (let i = Math.max(from, 0); i <= to; i++) {
        progressData[i] = i <= index ? source[i] : null;
    }
    progressIndex = index;
}

export function drawElevationChart(smoothedData) {
    let canvas = document.getElementById('elevationChart');
    if (!canvas) {
        console.error('#elevationChart canvas not found');
        return;
    }
    canvas.style.backgroundColor = "#f5ede1";
    if (typeof Chart === 'undefined') {
        console.error('Chart.js not loaded');
        return;
    }

    progressData = smoothedData.map(() => null);

    const ctx = canvas.getContext('2d');
    window.elevationChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: smoothedData.map(function(p){
                return p.dist.toFixed(2);
            }),
            datasets: [{
                label: 'Elevation (m)',
                data: smoothedData.map(p => p.ele),
                borderColor: PINE,
                backgroundColor: 'rgba(40, 63, 50, 0.10)',
                fill: true,
                pointRadius: 1,
                tension: 0.25,
                borderWidth: 1.2,
                order: 0
            }, {
                label: 'Progress',
                data: progressData,
                borderWidth: 0,
                backgroundColor: RUST,
                fill: 'origin',
                pointRadius: 0,
                pointHoverRadius: 0,
                tension: 0.25,
                spanGaps: false,
                order: 1   // drawn behind the profile line
            }]
        },
        plugins: [campLines],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            onHover: function(event, activeElement) {
                if(getPlaying() || isMapPanning()){
                    return;
                }
                const hit = activeElement.find(a => a.datasetIndex === 0);
                if(!hit){
                    return;
                }
                setIndex(hit.index, Source.CHART);
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    filter: item => item.datasetIndex === 0,
                    callbacks: {
                        label: ctx => {
                            const p = smoothedData[ctx.dataIndex];

                            return [
                                `Elevation: ${p.ele ?? 'n/a'} m`,
                                `Slope: ${p.slope ?? 'n/a'}`,
                                `Grade: ${p.grade ?? 'n/a'}%`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    min: 0,
                    max: smoothedData[smoothedData.length - 1].dist,
                    ticks: {
                        callback: v => v.toFixed(1) + ' km'
                    },
                    title: { display: true, text: 'Distance (km)' }
                },
                y: {
                    title: { display: true, text: 'Elevation (m)' },
                    grace: '8%'   // headroom for camp labels
                }
            }
        }
    });
}
