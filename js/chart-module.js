import { isMapPanning } 
from "./map-module.js";
import {HoverSource, setHoverIndex } 
from "./controller-module.js";




export function drawElevationChart(smoothedData) {
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
            interaction: { mode: 'index', intersect: false },
            onHover: function(event, activeElement) {
                if(isMapPanning()){
                    return;
                }
                if(!activeElement.length){
                    return;
                }
                const index = activeElement[0].index;
                setHoverIndex(index, HoverSource.CHART);
            },
            plugins: {
                legend: { display: false },
                tooltip: {
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
                y: { title: { display: true, text: 'Elevation (m)' } }
            }
        }
    });
}