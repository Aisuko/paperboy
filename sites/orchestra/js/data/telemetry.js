// Live-jittering input features shown in the Input Telemetry world, base
// values sourced from the original Orchestra dashboard's Zone 1.

export const TELEMETRY_FEATURES = [
	{ key: 'cycle', label: 'Cycle Index', base: 247, jitter: 4, decimals: 0, unit: '' },
	{ key: 'capacity', label: 'Capacity (Ah)', base: 1.84, jitter: 0.03, decimals: 2, unit: '' },
	{ key: 'voltage', label: 'Voltage (V)', base: 3.71, jitter: 0.06, decimals: 2, unit: '' },
	{ key: 'temperature', label: 'Temperature', base: 24.3, jitter: 0.5, decimals: 1, unit: '°C' },
];

export const EMBEDDING_DIM = 768;

export function jitterValue( feature ) {

	const delta = ( Math.random() - 0.5 ) * feature.jitter;
	return ( feature.base + delta ).toFixed( feature.decimals ) + feature.unit;

}
