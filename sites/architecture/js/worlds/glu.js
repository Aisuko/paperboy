import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { createWall, createFrame, createRail, paintCell } from '../utils/tensorKit.js';
import { barRow, setSigned, tintBar } from '../utils/barKit.js';
import { GLUS, BY_GLU, ffn, W_GATE, W_UP, W_DOWN } from '../data/acts.js';

const D = 6;
const DFF = 8;
const PITCH = 0.5;
const SCALE = 0.5;

const X_IN = -9.4;
const X_WG = -6.6;
const X_A = -3.6;
const X_G = -1.4;
const X_H = 1.6;
const X_W2 = 4.4;
const X_OUT = 7.2;

const Y_GATE = 2.5;
const Y_UP = -2.5;

const VIEWS = [
	{ position: new THREE.Vector3( -5.6, 1.2, 20 ), target: new THREE.Vector3( -5.6, 0.9, 0 ) },
	{ position: new THREE.Vector3( -2.4, 0.0, 22 ), target: new THREE.Vector3( -2.4, -0.2, 0 ) },
	{ position: new THREE.Vector3( -2.4, 0.0, 22 ), target: new THREE.Vector3( -2.4, -0.2, 0 ) },
	{ position: new THREE.Vector3( -1.0, 0.2, 32 ), target: new THREE.Vector3( -1.0, 0.0, 0 ) },
	{ position: new THREE.Vector3( -1.0, 0.2, 32 ), target: new THREE.Vector3( -1.0, 0.0, 0 ) },
	{ position: new THREE.Vector3( -1.0, 0.2, 32 ), target: new THREE.Vector3( -1.0, 0.0, 0 ) },
];

const X_IN_VEC = [ 0.9, -1.4, 0.5, 1.8, -0.7, 0.2 ];

export function buildGluWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 110, { y: -6.2, divisions: 110 } ) );

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

	function column( n, x, y, kind, color ) {

		const col = barRow( n, { pitch: PITCH, along: 'y', axis: 'x', thick: 0.3, depth: 0.3, color } );
		col.position.set( x, y, 0 );
		col.userData.bars.forEach( ( b ) => ( b.userData.kind = kind ) );
		rig.add( col );

		const h = n * PITCH;
		rig.add( createRail( new THREE.Vector3( x, y - h / 2, 0 ), new THREE.Vector3( x, y + h / 2, 0 ), { radius: 0.018, opacity: 0.4 } ) );

		interactables.push( col );
		return col;

	}

	function matrix( rows, cols, x, y, kind, weight ) {

		const wall = createWall( { rows, cols, cell: 0.26, gap: 0.06, depth: 0.2 } );
		wall.position.set( x, y, 0 );
		wall.userData.cells.forEach( ( c ) => { c.userData.kind = kind; c.userData.w = weight( c.userData.row, c.userData.col ); } );
		rig.add( wall );

		const f = createFrame( wall.userData.width + 0.2, wall.userData.height + 0.2 );
		f.position.copy( wall.position );
		rig.add( f );

		interactables.push( wall );
		return wall;

	}

	const inCol = column( D, X_IN, 0, 'x', THEME.ink );
	label( 'in', 'x · ℝ⁶', 'label2d label2d-key', X_IN, 2.0 );

	const wGate = matrix( D, DFF, X_WG, Y_GATE, 'wgate', W_GATE );
	const wUp = matrix( D, DFF, X_WG, Y_UP, 'wup', W_UP );
	label( 'wgate', 'W · gate projection', 'label2d label2d-dim', X_WG, Y_GATE + 1.35 );
	label( 'wup', 'V · value projection', 'label2d label2d-dim', X_WG, Y_UP + 1.35 );

	const aCol = column( DFF, X_A, Y_GATE, 'a', THEME.info );
	const gCol = column( DFF, X_G, Y_GATE, 'gate', THEME.signal );
	const uCol = column( DFF, X_G, Y_UP, 'up', THEME.violet );
	const hCol = column( DFF, X_H, 0, 'h', THEME.accent );

	label( 'a', 'xW', 'label2d label2d-dim', X_A, Y_GATE + 1.5 );
	label( 'gate', '', 'label2d label2d-key', X_G, Y_GATE + 1.5 );
	label( 'up', 'xV · left linear', 'label2d label2d-dim', X_G, Y_UP + 1.5 );
	label( 'h', '', 'label2d label2d-key', X_H, 2.6 );

	const times = new THREE.Mesh(
		new THREE.TorusGeometry( 0.24, 0.055, 8, 22 ),
		new THREE.MeshStandardMaterial( { color: THEME.rose, emissive: THEME.rose, emissiveIntensity: 0.85 } ),
	);
	times.position.set( ( X_G + X_H ) / 2, 0, 0 );
	times.userData = { kind: 'times' };
	rig.add( times );
	interactables.push( times );

	label( 'times', '⊗', 'label2d label2d-key', ( X_G + X_H ) / 2, -0.7 );

	rig.add( createRail( new THREE.Vector3( X_G + 0.9, Y_GATE - 0.6, 0 ), new THREE.Vector3( ( X_G + X_H ) / 2, 0.28, 0 ), { radius: 0.022, color: THEME.signal, opacity: 0.55 } ) );
	const upFeed = createRail( new THREE.Vector3( X_G + 0.9, Y_UP + 0.6, 0 ), new THREE.Vector3( ( X_G + X_H ) / 2, -0.28, 0 ), { radius: 0.022, color: THEME.violet, opacity: 0.55 } );
	rig.add( upFeed );

	const w2 = matrix( DFF, D, X_W2, 0, 'wdown', W_DOWN );
	label( 'w2', 'W₂ · back to ℝ⁶', 'label2d label2d-dim', X_W2, 1.5 );

	const outCol = column( D, X_OUT, 0, 'y', THEME.accent );
	label( 'out', 'FFN(x)', 'label2d label2d-key', X_OUT, 2.0 );

	const paritySign = new THREE.Mesh(
		new THREE.BoxGeometry( 3.4, 0.16, 0.3 ),
		new THREE.MeshStandardMaterial( { color: THEME.signal, emissive: THEME.signal, emissiveIntensity: 0.6 } ),
	);
	paritySign.position.set( X_WG, -5.0, 0 );
	paritySign.userData = { kind: 'parity' };
	rig.add( paritySign );
	interactables.push( paritySign );

	label( 'parity', '', 'label2d label2d-dim', X_WG, -4.55 );

	let step = 0;
	let variantKey = 'swiglu';
	let dModel = 4096;

	const variant = () => BY_GLU[ variantKey ];

	function state() {

		const v = variant();
		const r = ffn( X_IN_VEC, v, DFF, D );
		const naive = 4 * dModel;
		const parity = Math.floor( 2 / 3 * naive );
		const rounded = Math.ceil( parity / 256 ) * 256;
		const dff = v.mats === 2 ? naive : rounded;
		return {
			variant: v, dModel, naive, parity, rounded, dff,
			params: v.mats * dModel * dff,
			basis: 2 * dModel * naive,
			...r,
		};

	}

	function render() {

		const s = state();
		const v = s.variant;
		const gated = v.mats === 3;

		inCol.userData.bars.forEach( ( b, i ) => { setSigned( b, X_IN_VEC[ i ], SCALE ); tintBar( b, THEME.ink, 0.55 ); } );

		wGate.userData.cells.forEach( ( c ) => paintCell( c, THEME.info, 0.1 + Math.abs( c.userData.w ) * 0.3 ) );
		wUp.userData.cells.forEach( ( c ) => paintCell( c, THEME.violet, 0.1 + Math.abs( c.userData.w ) * 0.3 ) );
		w2.userData.cells.forEach( ( c ) => paintCell( c, THEME.accent, 0.1 + Math.abs( c.userData.w ) * 0.5 ) );

		aCol.userData.bars.forEach( ( b, i ) => { setSigned( b, s.a[ i ], SCALE ); tintBar( b, THEME.info, 0.6 ); } );
		gCol.userData.bars.forEach( ( b, i ) => { setSigned( b, s.gate[ i ], SCALE ); tintBar( b, THEME.signal, 0.3 + Math.min( 1, Math.abs( s.gate[ i ] ) ) * 0.6 ); } );
		hCol.userData.bars.forEach( ( b, i ) => { setSigned( b, s.h[ i ], SCALE ); tintBar( b, THEME.accent, 0.7 ); } );
		outCol.userData.bars.forEach( ( b, i ) => { setSigned( b, s.y[ i ], SCALE ); tintBar( b, THEME.accent, 0.8 ); } );

		if ( gated ) uCol.userData.bars.forEach( ( b, i ) => { setSigned( b, s.up[ i ], SCALE ); tintBar( b, THEME.violet, 0.65 ); } );

		wUp.visible = gated;
		uCol.visible = gated;
		times.visible = gated;
		upFeed.visible = gated;
		labels.wup.element.textContent = gated ? 'V · value projection' : '';
		labels.up.element.textContent = gated ? 'xV · left linear' : '';
		labels.times.element.textContent = gated ? '⊗' : '';
		labels.gate.element.textContent = gated ? `${ v.gateLabel }(xW) · gate` : `${ v.gateLabel === '—' ? 'gelu' : v.gateLabel }(xW)`;
		labels.h.element.textContent = gated ? 'h = gate ⊗ value' : 'h';

		paritySign.visible = step >= 3;
		paritySign.scale.x = s.dff / s.naive;
		labels.parity.element.textContent = step >= 3
			? `d_ff ${ s.dff.toLocaleString( 'en-AU' ) } · ${ v.mats } matrices · ${ ( s.params / 1e6 ).toFixed( 1 ) } M vs ${ ( s.basis / 1e6 ).toFixed( 1 ) } M`
			: '';

		times.material.emissiveIntensity = step === 1 || step === 2 ? 1.1 : 0.5;

	}

	render();

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ i ]; },
		getState: state,
		setStep( i ) { step = i; render(); },
		setVariant( key ) { variantKey = key; render(); return state(); },
		setModel( d ) { dModel = d; render(); return state(); },
		describe( object ) {

			const u = object.userData;
			const s = state();
			const i = u.index ?? 0;
			const v = s.variant;

			if ( u.kind === 'x' ) return {
				category: 'input',
				name: `x[${ i }]`,
				blurb: 'the normalised residual stream',
				description: 'The MLP sub-block reads a normalised copy of the stream. Both projections below read this same vector — that is what makes the gate a function of the input rather than a learned constant.',
				metricLabel: 'value', metric: X_IN_VEC[ i ].toFixed( 3 ),
			};

			if ( u.kind === 'wgate' || u.kind === 'wup' ) return {
				category: u.kind === 'wgate' ? 'W · gate' : 'V · value',
				name: `w[${ u.row }, ${ u.col }]`,
				blurb: `d × d_ff = ${ s.dModel.toLocaleString( 'en-AU' ) } × ${ s.dff.toLocaleString( 'en-AU' ) }`,
				description: u.kind === 'wgate'
					? 'The gate projection. Whatever comes out of it goes through the variant\'s nonlinearity and then multiplies the other branch.'
					: 'The value projection, and the entire cost of gating. It is a third full matrix that a plain FFN does not have, which is why d_ff shrinks to keep the totals equal.',
				metricLabel: 'parameters in this matrix', metric: ( s.dModel * s.dff / 1e6 ).toFixed( 1 ) + ' M',
			};

			if ( u.kind === 'wdown' ) return {
				category: 'W₂ · down',
				name: `w₂[${ u.row }, ${ u.col }]`,
				blurb: `d_ff × d = ${ s.dff.toLocaleString( 'en-AU' ) } × ${ s.dModel.toLocaleString( 'en-AU' ) }`,
				description: 'Projects the wide hidden layer back onto the residual stream so the result can be added. Present in every variant.',
				metricLabel: 'parameters in this matrix', metric: ( s.dModel * s.dff / 1e6 ).toFixed( 1 ) + ' M',
			};

			if ( u.kind === 'a' ) return {
				category: 'pre-activation',
				name: `(xW)[${ i }]`,
				blurb: 'one hidden unit before the nonlinearity',
				description: 'A plain dot product. Everything interesting happens to it in the next column.',
				metricLabel: 'value', metric: s.a[ i ].toFixed( 4 ),
			};

			if ( u.kind === 'gate' ) return {
				category: v.mats === 3 ? 'gate' : 'activation',
				name: `${ v.gateLabel }((xW)[${ i }])`,
				blurb: v.expr,
				description: v.mats === 3
					? `Near zero this shuts its partner off entirely; near one it lets it through. LiGLU applies no function at all here and still beats every ungated FFN, which is the evidence that the multiplication is what matters.`
					: 'In a plain FFN this column is the hidden layer. Nothing multiplies it, so one unit cannot suppress another.',
				metricLabel: 'gate value', metric: s.gate[ i ].toFixed( 4 ),
			};

			if ( u.kind === 'up' ) return {
				category: 'value branch',
				name: `(xV)[${ i }]`,
				blurb: 'no nonlinearity on this side',
				description: 'The value branch stays linear in every GLU variant. All of the nonlinearity in a gated FFN comes from the gate and from the product itself.',
				metricLabel: 'value', metric: s.up[ i ].toFixed( 4 ),
			};

			if ( u.kind === 'h' ) return {
				category: 'hidden layer',
				name: `h[${ i }]`,
				blurb: v.mats === 3 ? 'gate × value' : 'σ(xW)',
				description: v.mats === 3
					? `A product of two learned functions of the same x, so h is quadratic in the input instead of linear-then-bent. Here ${ s.gate[ i ].toFixed( 3 ) } × ${ s.up[ i ].toFixed( 3 ) }.`
					: 'One number through one fixed curve.',
				metricLabel: 'value', metric: s.h[ i ].toFixed( 4 ),
			};

			if ( u.kind === 'times' ) return {
				category: 'the gate',
				name: 'elementwise product',
				blurb: 'GLU(x) = σ(xW) ⊗ (xV)',
				description: 'Cheap in FLOPs, expensive in parameters, and the only structural difference between a 2017 FFN and a 2024 one. It lets one hidden unit multiplicatively suppress another, which a pointwise curve can never do.',
				metricLabel: 'FLOPs at d_ff = ' + s.dff.toLocaleString( 'en-AU' ), metric: s.dff.toLocaleString( 'en-AU' ),
			};

			if ( u.kind === 'parity' ) return {
				category: 'parameter parity',
				name: `d_ff = ${ s.dff.toLocaleString( 'en-AU' ) }`,
				blurb: `${ v.mats } × ${ s.dModel.toLocaleString( 'en-AU' ) } × ${ s.dff.toLocaleString( 'en-AU' ) }`,
				description: `A plain FFN at d_ff = 4d would hold ${ ( s.basis / 1e6 ).toFixed( 1 ) } M parameters. Scaling the hidden width by ⅔ and rounding up to a multiple of 256 gives ${ ( s.params / 1e6 ).toFixed( 1 ) } M — close enough that the comparison is fair.`,
				metricLabel: 'parameters', metric: ( s.params / 1e6 ).toFixed( 1 ) + ' M',
			};

			if ( u.kind === 'y' ) return {
				category: 'output',
				name: `FFN(x)[${ i }]`,
				blurb: 'added back to the residual stream',
				description: 'Back in ℝᵈ, ready to be added to the stream that produced it. Whatever the hidden layer did, the block only ever returns a correction of the same shape.',
				metricLabel: 'value', metric: s.y[ i ].toFixed( 4 ),
			};

			return null;

		},
		update() {},
	};

}
