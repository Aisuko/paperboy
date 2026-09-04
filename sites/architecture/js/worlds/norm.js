import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { createRail, createFrame } from '../utils/tensorKit.js';
import { barRow, setSigned, tintBar, polyline } from '../utils/barKit.js';
import { BASE, layerNorm, rmsNorm, mean } from '../data/norm.js';

const D = BASE.length;
const PITCH = 0.52;
const SCALE = 0.42;
const LN_X = -4.4;
const RM_X = 4.4;
const ROW_Y = [ 0.9, -1.6, -4.1 ];
const IN_Y = 3.5;

const GAMMA = Array.from( { length: D }, ( _, i ) => 1 + 0.18 * Math.sin( i * 1.3 ) );
const BETA = Array.from( { length: D }, ( _, i ) => 0.12 * Math.cos( i * 0.9 ) );

const VIEWS = [
	{ position: new THREE.Vector3( 0, 3.3, 11.5 ), target: new THREE.Vector3( 0, 3.3, 0 ) },
	{ position: new THREE.Vector3( -2.4, 2.2, 17 ), target: new THREE.Vector3( -2.4, 2.0, 0 ) },
	{ position: new THREE.Vector3( -4.4, -0.5, 17 ), target: new THREE.Vector3( -4.4, -0.9, 0 ) },
	{ position: new THREE.Vector3( 4.4, -0.5, 17 ), target: new THREE.Vector3( 4.4, -0.9, 0 ) },
	{ position: new THREE.Vector3( 0, -0.4, 27 ), target: new THREE.Vector3( 0, -0.6, 0 ) },
	{ position: new THREE.Vector3( 0, 0.0, 29 ), target: new THREE.Vector3( 0, -0.3, 0 ) },
	{ position: new THREE.Vector3( 0, 0.0, 29 ), target: new THREE.Vector3( 0, -0.3, 0 ) },
];

export function buildNormWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 80, { y: -6.4, divisions: 80 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = [];
	const labels = {};

	const label = ( key, text, cls, x, y, z = 0, parent = rig ) => {

		const l = createLabel( text, cls );
		l.position.set( x, y, z );
		parent.add( l );
		labels[ key ] = l;
		return l;

	};

	const span = D * PITCH;

	function makeRow( x, y, kind, side, color ) {

		const row = barRow( D, { pitch: PITCH, thick: 0.32, depth: 0.32, color } );
		row.position.set( x, y, 0 );
		row.userData.bars.forEach( ( b ) => { b.userData.kind = kind; b.userData.side = side; } );
		rig.add( row );

		const rail = createRail( new THREE.Vector3( x - span / 2, y, 0 ), new THREE.Vector3( x + span / 2, y, 0 ), { radius: 0.02, opacity: 0.5 } );
		rig.add( rail );

		interactables.push( row );
		return row;

	}

	const input = makeRow( 0, IN_Y, 'input', 'in', THEME.ink );
	label( 'input', '', 'label2d label2d-key', 0, IN_Y + 1.5 );

	const muLine = polyline( [ new THREE.Vector3( -span / 2 - 0.3, 0, 0 ), new THREE.Vector3( span / 2 + 0.3, 0, 0 ) ], THEME.signal );
	muLine.position.set( 0, IN_Y, 0.25 );
	rig.add( muLine );
	label( 'mu', '', 'label2d label2d-key', span / 2 + 1.1, IN_Y );

	const lnRows = [
		makeRow( LN_X, ROW_Y[ 0 ], 'ln-centre', 'ln', THEME.info ),
		makeRow( LN_X, ROW_Y[ 1 ], 'ln-hat', 'ln', THEME.info ),
		makeRow( LN_X, ROW_Y[ 2 ], 'ln-out', 'ln', THEME.accent ),
	];

	const rmRows = [
		makeRow( RM_X, ROW_Y[ 1 ], 'rms-hat', 'rms', THEME.violet ),
		makeRow( RM_X, ROW_Y[ 2 ], 'rms-out', 'rms', THEME.accent ),
	];

	const skipPlate = new THREE.Mesh(
		new THREE.PlaneGeometry( span + 0.5, 1.0 ),
		new THREE.MeshBasicMaterial( { color: THEME.muted, transparent: true, opacity: 0.16, side: THREE.DoubleSide } ),
	);
	skipPlate.position.set( RM_X, ROW_Y[ 0 ] + 0.35, -0.1 );
	skipPlate.userData = { kind: 'skip' };
	rig.add( skipPlate );
	interactables.push( skipPlate );

	label( 'skip', 'no mean · no subtraction', 'label2d label2d-dim', RM_X, ROW_Y[ 0 ] + 0.35 );

	[ [ LN_X, 'LayerNorm' ], [ RM_X, 'RMSNorm' ] ].forEach( ( [ x, name ], i ) => {

		const head = createLabel( name, 'label2d label2d-key' );
		head.position.set( x, ROW_Y[ 0 ] + 1.55, 0 );
		rig.add( head );
		labels[ i === 0 ? 'lnHead' : 'rmHead' ] = head;

		const f = createFrame( span + 1.0, 6.4 );
		f.position.set( x, -1.6, -0.2 );
		rig.add( f );

		rig.add( createRail( new THREE.Vector3( 0, IN_Y - 0.9, 0 ), new THREE.Vector3( x, ROW_Y[ 0 ] + 1.15, 0 ), { radius: 0.025, color: THEME.accent, opacity: 0.5 } ) );

	} );

	const rowCaps = {};
	[ [ 'lnA', LN_X, ROW_Y[ 0 ] ], [ 'lnB', LN_X, ROW_Y[ 1 ] ], [ 'lnC', LN_X, ROW_Y[ 2 ] ],
		[ 'rmA', RM_X, ROW_Y[ 1 ] ], [ 'rmB', RM_X, ROW_Y[ 2 ] ] ].forEach( ( [ key, x, y ] ) => {

		rowCaps[ key ] = label( key, '', 'label2d label2d-dim', x, y - 1.0 );

	} );

	let step = 0;
	let shift = 0;

	const vec = () => BASE.map( ( v ) => v + shift );

	function state() {

		const x = vec();
		const ln = layerNorm( x, GAMMA, BETA );
		const rm = rmsNorm( x, GAMMA );
		const hatDiff = Math.sqrt( ln.hat.reduce( ( a, v, i ) => a + ( v - rm.hat[ i ] ) ** 2, 0 ) / D );
		return { x, ln, rm, shift, mu: ln.mu, hatDiff, outMean: mean( rm.out ) };

	}

	function render() {

		const s = state();
		const maxIn = Math.max( ...s.x.map( Math.abs ), 1 );
		const inScale = Math.min( SCALE, 1.7 / maxIn );

		input.userData.bars.forEach( ( b, i ) => {

			setSigned( b, s.x[ i ], inScale );
			tintBar( b, THEME.ink, 0.5 );

		} );

		muLine.position.y = IN_Y + s.mu * inScale;
		muLine.material.opacity = step === 1 || step === 4 ? 0.95 : 0.35;
		labels.mu.element.textContent = `μ = ${ s.mu.toFixed( 3 ) }`;
		labels.mu.position.set( span / 2 + 1.1, IN_Y + s.mu * inScale, 0 );
		labels.input.element.textContent = `x ∈ ℝ⁸ · mean ${ s.mu.toFixed( 3 ) } · rms ${ s.rm.rms.toFixed( 3 ) }`;

		const paint = ( row, values, color, level ) => row.userData.bars.forEach( ( b, i ) => {

			setSigned( b, values[ i ], SCALE );
			tintBar( b, color, level );

		} );

		paint( lnRows[ 0 ], s.ln.centred, THEME.info, step >= 1 ? 0.75 : 0.28 );
		paint( lnRows[ 1 ], s.ln.hat, THEME.info, step >= 2 ? 0.75 : 0.28 );
		paint( lnRows[ 2 ], s.ln.out, THEME.accent, step >= 2 ? 0.85 : 0.28 );
		paint( rmRows[ 0 ], s.rm.hat, THEME.violet, step >= 3 ? 0.75 : 0.28 );
		paint( rmRows[ 1 ], s.rm.out, THEME.accent, step >= 3 ? 0.85 : 0.28 );

		labels.lnA.element.textContent = `x − μ   ·   mean 0.000`;
		labels.lnB.element.textContent = `(x − μ)/σ   ·   σ = ${ s.ln.sigma.toFixed( 3 ) }`;
		labels.lnC.element.textContent = `γ ⊙ x̂ + β   ·   2d params`;
		labels.rmA.element.textContent = `x / rms   ·   rms = ${ s.rm.rms.toFixed( 3 ) }`;
		labels.rmB.element.textContent = `γ ⊙ x̂   ·   d params`;

		labels.lnHead.element.className = 'label2d ' + ( step === 1 || step === 2 ? 'label2d-key' : 'label2d-dim' );
		labels.rmHead.element.className = 'label2d ' + ( step === 3 ? 'label2d-key' : 'label2d-dim' );
		labels.skip.element.textContent = step >= 3 ? `RMSNorm skips this row · Δx̂ = ${ s.hatDiff.toFixed( 3 ) }` : 'no mean · no subtraction';
		skipPlate.material.opacity = step >= 3 ? 0.2 : 0.08;

	}

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ i ]; },
		getState: state,
		setStep( i ) { step = i; render(); },
		setShift( v ) { shift = v; render(); return state(); },
		describe( object ) {

			const u = object.userData;
			const s = state();
			const i = u.index ?? 0;

			if ( u.kind === 'skip' ) return {
				category: 'the whole difference',
				name: 're-centring',
				blurb: 'the row RMSNorm does not have',
				description: 'Everything else in the two pipelines is identical. RMSNorm keeps re-scaling invariance and drops re-centring invariance, on the hypothesis that only the first one was doing the work. Ten years of models have not contradicted it.',
				metricLabel: 'rms Δ between the normalised rows', metric: s.hatDiff.toFixed( 4 ),
			};

			if ( u.kind === 'input' ) return {
				category: 'input',
				name: `x[${ i }]`,
				blurb: `one of ${ D } features for one token`,
				description: `Statistics are taken across this row and nowhere else — not across the batch, not across the sequence. Change the mean with the slider and watch which of the two pipelines notices.`,
				metricLabel: 'value', metric: s.x[ i ].toFixed( 4 ),
			};

			if ( u.kind === 'ln-centre' ) return {
				category: 'LayerNorm · step 1',
				name: `x[${ i }] − μ`,
				blurb: `μ = ${ s.mu.toFixed( 4 ) }`,
				description: 'One full reduction over the feature axis, then a subtraction. This row is what makes LayerNorm invariant to a constant added to every feature.',
				metricLabel: 'centred', metric: s.ln.centred[ i ].toFixed( 4 ),
			};

			if ( u.kind === 'ln-hat' ) return {
				category: 'LayerNorm · step 2',
				name: `x̂[${ i }]`,
				blurb: `σ = ${ s.ln.sigma.toFixed( 4 ) }   (a second reduction)`,
				description: 'Variance is computed over the centred vector, so the two reductions cannot be fused into one pass without an algebraic rewrite. After this the row has mean 0 and unit variance by construction.',
				metricLabel: 'normalised', metric: s.ln.hat[ i ].toFixed( 4 ),
			};

			if ( u.kind === 'ln-out' ) return {
				category: 'LayerNorm · output',
				name: `y[${ i }]`,
				blurb: `γ = ${ GAMMA[ i ].toFixed( 3 ) }   β = ${ BETA[ i ].toFixed( 3 ) }`,
				description: 'Two learned vectors of length d. β is the one RMSNorm drops, along with every other bias in models like PaLM and LLaMA — biases add parameters, cost a load, and cost stability at scale.',
				metricLabel: 'output', metric: s.ln.out[ i ].toFixed( 4 ),
			};

			if ( u.kind === 'rms-hat' ) return {
				category: 'RMSNorm',
				name: `x̂[${ i }]`,
				blurb: `rms = ${ s.rm.rms.toFixed( 4 ) }`,
				description: 'One reduction over x², one reciprocal square root, one multiply. The raw value goes in — no centring — so a mean in the input survives into the output.',
				metricLabel: 'normalised', metric: s.rm.hat[ i ].toFixed( 4 ),
			};

			if ( u.kind === 'rms-out' ) return {
				category: 'RMSNorm · output',
				name: `y[${ i }]`,
				blurb: `γ = ${ GAMMA[ i ].toFixed( 3 ) }   ·   no β`,
				description: `Compare against the LayerNorm output on the left. At mean ${ s.mu.toFixed( 3 ) } the two normalised rows are ${ s.hatDiff < 1e-6 ? 'identical' : 'apart by ' + s.hatDiff.toFixed( 4 ) + ' rms' }.`,
				metricLabel: 'output', metric: s.rm.out[ i ].toFixed( 4 ),
			};

			return null;

		},
		update() {},
	};

}
