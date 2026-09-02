import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { createStrip, createWall, createLinks, createCurve, curvePoint, cellAt, paintCell, valueColor } from '../utils/tensorKit.js';
import { tween, Easing } from '../utils/tween.js';
import { mlp, gelu, PROMPT, SHOWN, GPT2, W1, W2 } from '../data/model.js';

const X_IN = -6.2;
const X_HID = -1.8;
const X_OUT = 2.6;
const X_ADD = 4.6;
const X_RES = 6.6;

const ROWS = 8;
const COLS = SHOWN.dff / ROWS;

const VIEWS = [
	{ position: new THREE.Vector3( 0.2, 2.6, 21 ), target: new THREE.Vector3( 0.2, 0.9, 0 ) },
	{ position: new THREE.Vector3( 0.2, 3.4, 19 ), target: new THREE.Vector3( 0.2, 1.4, 0 ) },
	{ position: new THREE.Vector3( -4.0, 1.0, 12 ), target: new THREE.Vector3( -4.0, 0.1, 0 ) },
	{ position: new THREE.Vector3( -1.8, 3.9, 8.5 ), target: new THREE.Vector3( -1.8, 3.7, 0 ) },
	{ position: new THREE.Vector3( 0.5, 0.8, 12 ), target: new THREE.Vector3( 0.5, 0.1, 0 ) },
	{ position: new THREE.Vector3( 4.6, 1.0, 10.5 ), target: new THREE.Vector3( 4.6, 0.2, 0 ) },
];

export function buildMlpWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 70, { y: -4.4, divisions: 70 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = [];

	const input = createStrip( { count: SHOWN.d } );
	input.position.set( X_IN, 0, 0 );
	rig.add( input );

	const hidden = createWall( { rows: ROWS, cols: COLS, cell: 0.3, gap: 0.08, depth: 0.3 } );
	hidden.position.set( X_HID, 0, 0 );
	rig.add( hidden );

	const output = createStrip( { count: SHOWN.d } );
	output.position.set( X_OUT, 0, 0 );
	rig.add( output );

	const residual = createStrip( { count: SHOWN.d } );
	residual.position.set( X_RES, 0, 0 );
	rig.add( residual );

	const neuronCell = ( j ) => cellAt( hidden, Math.floor( j / COLS ), j % COLS );

	const worldOf = ( group, mesh ) => new THREE.Vector3().copy( mesh.position ).add( group.position );

	const pairsIn = [];
	for ( let i = 0; i < SHOWN.d; i ++ ) {

		for ( let j = 0; j < SHOWN.dff; j ++ ) pairsIn.push( [ worldOf( input, input.userData.cells[ i ] ), worldOf( hidden, neuronCell( j ) ) ] );

	}
	const linksIn = createLinks( pairsIn );
	rig.add( linksIn );

	const pairsOut = [];
	for ( let j = 0; j < SHOWN.dff; j ++ ) {

		for ( let i = 0; i < SHOWN.d; i ++ ) pairsOut.push( [ worldOf( hidden, neuronCell( j ) ), worldOf( output, output.userData.cells[ i ] ) ] );

	}
	const linksOut = createLinks( pairsOut );
	rig.add( linksOut );

	const gate = new THREE.Group();
	gate.position.set( X_HID, 3.7, 0 );
	rig.add( gate );

	const curve = createCurve( gelu, { from: -3, to: 3, width: 3.4, height: 1.1, color: THEME.signal } );
	gate.add( curve );

	const axis = new THREE.Mesh(
		new THREE.BoxGeometry( 3.4, 0.012, 0.012 ),
		new THREE.MeshBasicMaterial( { color: THEME.muted, transparent: true, opacity: 0.6 } ),
	);
	gate.add( axis );

	const markers = [];
	for ( let j = 0; j < SHOWN.dff; j ++ ) {

		const m = new THREE.Mesh(
			new THREE.SphereGeometry( 0.055, 12, 12 ),
			new THREE.MeshStandardMaterial( { color: THEME.accent, emissive: THEME.accent, emissiveIntensity: 0.7, roughness: 0.4 } ),
		);
		gate.add( m );
		markers.push( m );

	}

	const gateLabel = createLabel( 'GELU', 'label2d label2d-key' );
	gateLabel.position.set( -1.9, 0.9, 0 );
	gate.add( gateLabel );

	const addNode = new THREE.Mesh(
		new THREE.TorusGeometry( 0.34, 0.05, 12, 32 ),
		new THREE.MeshStandardMaterial( { color: THEME.signal, emissive: THEME.signal, emissiveIntensity: 0.8, roughness: 0.4 } ),
	);
	addNode.position.set( X_ADD, 0, 0 );
	rig.add( addNode );

	const addBar = new THREE.Mesh(
		new THREE.BoxGeometry( 0.4, 0.05, 0.05 ),
		new THREE.MeshStandardMaterial( { color: THEME.signal, emissive: THEME.signal, emissiveIntensity: 0.8 } ),
	);
	addNode.add( addBar );
	const addBar2 = addBar.clone();
	addBar2.rotation.z = Math.PI / 2;
	addNode.add( addBar2 );

	const skip = new THREE.Mesh(
		new THREE.TubeGeometry( new THREE.CatmullRomCurve3( [
			new THREE.Vector3( X_IN, 1.7, 0 ),
			new THREE.Vector3( ( X_IN + X_ADD ) / 2, 3.0, 0 ),
			new THREE.Vector3( X_ADD, 0.42, 0 ),
		] ), 40, 0.022, 6, false ),
		new THREE.MeshStandardMaterial( { color: THEME.signal, emissive: THEME.signal, emissiveIntensity: 0.45, transparent: true, opacity: 0.7 } ),
	);
	rig.add( skip );

	function tag( text, sub, x, y ) {

		const head = createLabel( text, 'label2d label2d-key' );
		head.position.set( x, y, 0 );
		rig.add( head );
		const s = createLabel( sub, 'label2d label2d-dim' );
		s.position.set( x, y - 0.36, 0 );
		rig.add( s );
		return { head, sub: s };

	}

	tag( 'x  ·  residual stream', `${ SHOWN.d } of ${ GPT2.dModel } dims`, X_IN, -1.9 );
	const hiddenTag = tag( 'W1 · x + b1', `${ SHOWN.dff } of ${ GPT2.dFF } neurons`, X_HID, -1.9 );
	tag( 'y  ·  MLP output', 'W2 · act + b2', X_OUT, -1.9 );
	tag( 'x + y', 'back into the stream', X_RES, -1.9 );

	const compare = createLabel( 'attention mixes across positions  ·  the MLP computes inside one', 'label2d label2d-dim' );
	compare.position.set( 0.2, 2.6, 0 );
	rig.add( compare );

	let token = PROMPT.length - 1;
	let step = 0;
	let state = mlp( token );

	hidden.userData.cells.forEach( ( c ) => { c.userData.pickable = true; } );
	interactables.push( hidden, input, output, residual );

	function paintStrip( strip, values, gain = 1, dim = false ) {

		strip.userData.cells.forEach( ( c, i ) => paintCell( c, values ? values[ i ] : 0, { gain, dim } ) );

	}

	function pop( meshes ) {

		meshes.forEach( ( m ) => tween( 0.35, ( t ) => m.scale.setScalar( 1 + Math.sin( t * Math.PI ) * 0.35 ), { easing: Easing.cubicOut } ) );

	}

	function render() {

		const { x, pre, act, y, out } = state;

		paintStrip( input, x, 0.9, false );
		paintStrip( output, y, 0.8, step < 4 );
		paintStrip( residual, out, 0.6, step < 5 );

		const showAct = step >= 3;
		hidden.userData.cells.forEach( ( c, idx ) => {

			const r = Math.floor( idx / COLS ), col = idx % COLS;
			const j = r * COLS + col;
			const v = showAct ? act[ j ] : pre[ j ];
			paintCell( c, v, { gain: 0.7, dim: step < 2 || ( showAct && act[ j ] < 0.05 ) } );

		} );

		hiddenTag.head.element.textContent = showAct ? 'GELU(W1 · x + b1)' : 'W1 · x + b1';
		hiddenTag.sub.element.textContent = showAct
			? `${ state.fired } of ${ SHOWN.dff } drawn neurons fire`
			: `${ SHOWN.dff } of ${ GPT2.dFF } neurons`;

		linksIn.userData.paint( ( i ) => {

			const dim = new THREE.Color( THEME.muted ).multiplyScalar( 0.2 );
			if ( step < 2 ) return dim;
			const src = Math.floor( i / SHOWN.dff );
			const j = i % SHOWN.dff;
			const w = W1[ j ][ src ] * x[ src ];
			return valueColor( w, { gain: 1.4 } ).multiplyScalar( 0.45 );

		} );

		linksOut.userData.paint( ( i ) => {

			const dim = new THREE.Color( THEME.muted ).multiplyScalar( 0.2 );
			if ( step < 4 ) return dim;
			const j = Math.floor( i / SHOWN.d );
			const d = i % SHOWN.d;
			if ( act[ j ] < 0.05 ) return dim;
			return valueColor( W2[ d ][ j ] * act[ j ], { gain: 2.2 } ).multiplyScalar( 0.5 );

		} );

		gate.visible = step >= 3;
		markers.forEach( ( m, j ) => {

			const p = curvePoint( curve, pre[ j ] );
			m.position.set( p.x, p.y, 0 );
			const live = act[ j ] >= 0.05;
			m.material.color.set( live ? THEME.accent : THEME.muted );
			m.material.emissive.set( live ? THEME.accent : THEME.muted );
			m.material.emissiveIntensity = live ? 0.8 : 0.15;

		} );

		addNode.visible = step >= 5;
		skip.visible = step >= 5;
		compare.element.style.opacity = step === 1 ? '1' : '0.12';

	}

	render();

	let elapsed = 0;

	return {
		scene,
		interactables,
		stepCount: 6,
		defaultView: VIEWS[ 0 ],
		getStepView( i ) { return VIEWS[ Math.max( 0, Math.min( VIEWS.length - 1, i ) ) ]; },
		setToken( t ) {

			token = t;
			state = mlp( t );
			render();
			pop( hidden.userData.cells );
			return state;

		},
		setStep( i ) {

			step = i;
			render();
			if ( i === 2 ) pop( hidden.userData.cells );
			if ( i === 4 ) pop( output.userData.cells );
			if ( i === 5 ) pop( residual.userData.cells );
			return state;

		},
		getState() { return { token, step, ...state }; },
		describe( object ) {

			const u = object.userData;
			if ( u.row === undefined ) {

				const i = u.index;
				const from = object.parent;
				const which = from === input ? 'x' : from === output ? 'y' : 'x + y';
				const value = from === input ? state.x[ i ] : from === output ? state.y[ i ] : state.out[ i ];
				return {
					category: 'residual stream',
					name: `${ which }[${ i }]`,
					blurb: `dimension ${ i } of ${ GPT2.dModel }`,
					description: `One coordinate of the vector for token "${ PROMPT[ token ].trim() }". The MLP reads all ${ GPT2.dModel } of them and writes all ${ GPT2.dModel } back.`,
					metricLabel: 'value',
					metric: value.toFixed( 4 ),
				};

			}

			const j = u.row * COLS + u.col;
			const top = W2.map( ( row, d ) => [ Math.abs( row[ j ] * state.act[ j ] ), d ] ).sort( ( a, b ) => b[ 0 ] - a[ 0 ] )[ 0 ];
			return {
				category: 'hidden neuron',
				name: `neuron ${ j }`,
				blurb: `${ j + 1 } of ${ GPT2.dFF } in the wide layer`,
				description: `Pre-activation ${ state.pre[ j ].toFixed( 4 ) } — the dot product of W1 row ${ j } with x, plus bias. GELU turns that into ${ state.act[ j ].toFixed( 4 ) }. Its strongest write goes into dimension ${ top[ 1 ] } of the output.`,
				metricLabel: state.act[ j ] >= 0.05 ? 'activation (firing)' : 'activation (gated off)',
				metric: state.act[ j ].toFixed( 4 ),
			};

		},
		update( dt ) {

			elapsed += dt;
			if ( addNode.visible ) addNode.rotation.z = elapsed * 0.6;

		},
	};

}
