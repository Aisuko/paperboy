// The input features the council estimates from. Base values come from the
// source Orchestra dashboard's input zone; `jitter` is the peak-to-peak noise
// used to make the readouts move the way a live sensor feed does.

export const TELEMETRY_FEATURES = [
	{ key: 'cycle', label: 'Cycle index', base: 247, jitter: 0, decimals: 0, unit: '' },
	{ key: 'capacity', label: 'Capacity', base: 1.84, jitter: 0.03, decimals: 2, unit: ' Ah' },
	{ key: 'voltage', label: 'Terminal voltage', base: 3.71, jitter: 0.06, decimals: 2, unit: ' V' },
	{ key: 'current', label: 'Current', base: -1.02, jitter: 0.08, decimals: 2, unit: ' A' },
	{ key: 'temperature', label: 'Pack temperature', base: 24.3, jitter: 0.5, decimals: 1, unit: ' °C' },
	{ key: 'resistance', label: 'DC resistance', base: 42.6, jitter: 0.9, decimals: 1, unit: ' mΩ' },
];

// The nominal capacity the state-of-health ratio is taken against.
export const NOMINAL_CAPACITY = 1.95; // Ah
export const EMBEDDING_DIM = 768;

export function jitterValue( feature ) {

	const delta = ( Math.random() - 0.5 ) * feature.jitter;
	return ( feature.base + delta ).toFixed( feature.decimals ) + feature.unit;

}
