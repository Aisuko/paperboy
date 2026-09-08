import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME, EMISSIVE } from '../utils/sceneKit.js';
import { createStrip, createWall, createFrame, paintCell, cellAt } from '../utils/tensorKit.js';

const ROWS = 6;
const COLS = 8;
const SLABS = 3;
const N = ROWS * COLS;

const VIEWS = [
	{ position: new THREE.Vector3( -2.0, 3.4, 20 ), target: new THREE.Vector3( -2.0, 0.2, 0 ) },
	{ position: new THREE.Vector3( 0.4, 4.2, 17 ), target: new THREE.Vector3( 0.4, 0.4, 0 ) },
	{ position: new THREE.Vector3( -2.6, 1.2, 12 ), target: new THREE.Vector3( -2.6, -1.4, 0 ) },
	{ position: new THREE.Vector3( -2.6, -0.6, 12 ), target: new THREE.Vector3( -2.6, -0.9, 0 ) },
	{ position: new THREE.Vector3( -2.6, 2.0, 12 ), target: new THREE.Vector3( -2.6, -1.2, 0 ) },
	{ position: new THREE.Vector3( 0.0, 1.4, 21 ), target: new THREE.Vector3( 0.0, -1.4, 0 ) },
];

export const matrixValue = ( r, c ) => Math.sin( r * 1.7 + c * 0.9 ) * 0.9;

export function buildTensorWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 70, { y: -5.2, divisions: 70 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = [];

	const scalar = createStrip( { count: 1, cell: 0.44, depth: 0.44 } );
	scalar.position.set( -10, 0.4, 0 );
	scalar.userData.cells[ 0 ].userData.kind = 'scalar';
	rig.add( scalar );

	const vector = createStrip( { count: COLS } );
	vector.position.set( -7, 0.4, 0 );
	vector.userData.cells.forEach( ( m ) => ( m.userData.kind = 'vector' ) );
	rig.add( vector );

	const matrix = createWall( { rows: ROWS, cols: COLS } );
	matrix.position.set( -2.6, 0.4, 0 );
	matrix.userData.cells.forEach( ( m ) => ( m.userData.kind = 'matrix' ) );
	rig.add( matrix );

	const slabs = [];
	for ( let s = 0; s < SLABS; s ++ ) {

		const slab = createWall( { rows: ROWS, cols: COLS } );
		slab.position.set( 3.4, 0.4, ( s - 1 ) * 1.1 );
		slab.userData.cells.forEach( ( m ) => { m.userData.kind = 'tensor'; m.userData.slab = s; } );
		rig.add( slab );
		slabs.push( slab );

	}

	const tape = createStrip( { count: N, cell: 0.3, gap: 0.07, depth: 0.3 } );
	tape.position.set( 0, -3.2, 0 );
	tape.userData.cells.forEach( ( m ) => ( m.userData.kind = 'tape' ) );
	rig.add( tape );

	const tapeFrame = createFrame( tape.userData.length + 0.2, 0.52 );
	tapeFrame.position.copy( tape.position );
	rig.add( tapeFrame );

	interactables.push( scalar, vector, matrix, tape, ...slabs );

	const labels = {};
	const label = ( key, text, cls, x, y, z = 0 ) => {

		const l = createLabel( text, cls );
		l.position.set( x, y, z );
		rig.add( l );
		labels[ key ] = l;
		return l;

	};

	label( 'scalar', 'rank 0 · scalar · ()', 'label2d label2d-dim', -10, 1.2 );
	label( 'vector', 'rank 1 · vector · (8,)', 'label2d label2d-dim', -7, 1.2 );
	label( 'matrix', 'rank 2 · matrix · (6, 8)', 'label2d label2d-key', -2.6, 1.9 );
	label( 'tensor', 'rank 3 · tensor · (3, 6, 8)', 'label2d label2d-dim', 3.4, 1.9 );
	label( 'tape', 'one flat buffer · 48 elements', 'label2d label2d-key', 0, -3.9 );
	label( 'cursor', '', 'label2d label2d-key', 0, -2.6 );

	const cursor = new THREE.Mesh(
		new THREE.ConeGeometry( 0.14, 0.3, 4 ),
		new THREE.MeshStandardMaterial( { color: THEME.signal, emissive: THEME.signal, emissiveIntensity: 0.9 * EMISSIVE } ),
	);
	cursor.rotation.x = Math.PI;
	cursor.visible = false;
	rig.add( cursor );

	let step = 0;
	let order = 'row';
	let head = 0;
	let clock = 0;
	let picked = 29;

	const orderIndex = ( n ) => order === 'row' ? n : ( n % ROWS ) * COLS + Math.floor( n / ROWS );

	function paintAll() {

		matrix.userData.cells.forEach( ( m ) => paintCell( m, THEME.accent, 0.16 + Math.abs( matrixValue( m.userData.row, m.userData.col ) ) * 0.25 ) );
		vector.userData.cells.forEach( ( m ) => paintCell( m, THEME.info, 0.3 ) );
		paintCell( scalar.userData.cells[ 0 ], THEME.violet, 0.45 );
		slabs.forEach( ( s ) => s.userData.cells.forEach( ( m ) => paintCell( m, THEME.accent, 0.14 ) ) );
		tape.userData.cells.forEach( ( m ) => paintCell( m, THEME.muted, step >= 2 ? 0.2 : 0.08 ) );

	}

	function mark( n, level = 1 ) {

		const i = orderIndex( n );
		const r = Math.floor( i / COLS );
		const c = i % COLS;
		paintCell( cellAt( matrix, r, c ), THEME.signal, level );
		paintCell( tape.userData.cells[ i ], THEME.signal, level );
		cursor.position.set( tape.position.x + tape.userData.cells[ i ].position.x, tape.position.y + 0.42, 0 );
		labels.cursor.element.textContent = `[${ r }, ${ c }]  →  offset ${ i }  ·  byte ${ i * 4 }`;
		labels.cursor.position.set( cursor.position.x, tape.position.y + 0.95, 0 );
		return { i, r, c };

	}

	function render() {

		paintAll();
		const sweeping = step === 2 || step === 4;
		cursor.visible = sweeping || step === 3;
		labels.cursor.element.textContent = '';
		labels.tape.element.textContent = step >= 2 ? `one flat buffer · ${ N } elements · ${ N * 4 } bytes at fp32` : 'one flat buffer';
		labels.matrix.element.className = 'label2d ' + ( step >= 2 ? 'label2d-key' : 'label2d-dim' );

		if ( step === 3 ) {

			for ( let n = 0; n < N; n ++ ) if ( n !== picked ) paintCell( tape.userData.cells[ n ], THEME.muted, 0.18 );
			mark( picked );

		} else if ( step === 5 ) {

			tape.userData.cells.forEach( ( m ) => paintCell( m, THEME.info, 0.55 ) );

		} else if ( sweeping ) {

			head = 0;
			clock = 0;

		}

	}

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ i ]; },
		setStep( i ) {

			step = i;
			order = i === 4 ? 'col' : 'row';
			render();

		},
		getState() { return { step, order, picked, head }; },
		setPicked( n ) {

			picked = n;
			if ( step === 3 ) render();
			return { r: Math.floor( n / COLS ), c: n % COLS, offset: n };

		},
		describe( object ) {

			const u = object.userData;

			if ( u.kind === 'scalar' ) return {
				category: 'rank 0',
				name: 'scalar',
				blurb: 'shape () · 0 indices',
				description: 'A single number with no axes. It still carries a dtype and a device, and it still occupies whole bytes.',
				metricLabel: 'bytes at fp32', metric: '4',
			};

			if ( u.kind === 'vector' ) return {
				category: 'rank 1',
				name: `v[${ u.index }]`,
				blurb: 'shape (8,) · stride (1,)',
				description: 'One axis, so one index and one stride. A rank-1 tensor is the only case where the tape and the shape look the same.',
				metricLabel: 'byte offset', metric: `${ u.index * 4 }`,
			};

			if ( u.kind === 'tape' ) {

				const r = Math.floor( u.index / COLS );
				const c = u.index % COLS;
				return {
					category: 'buffer',
					name: `offset ${ u.index }`,
					blurb: `bytes ${ u.index * 4 } – ${ u.index * 4 + 3 } at fp32`,
					description: `Read row-major this slot is element [${ r }, ${ c }]. Read as the transpose it is element [${ c }, ${ r }] — the same bytes, a different stride.`,
					metricLabel: 'value', metric: matrixValue( r, c ).toFixed( 4 ),
				};

			}

			if ( u.kind === 'tensor' ) return {
				category: 'rank 3',
				name: `t[${ u.slab }, ${ u.row }, ${ u.col }]`,
				blurb: 'shape (3, 6, 8) · stride (48, 8, 1)',
				description: `Three indices, three strides. This element sits at offset ${ u.slab * 48 + u.row * COLS + u.col } of a 144-element buffer that is as flat as every other one.`,
				metricLabel: 'offset', metric: `${ u.slab * 48 + u.row * COLS + u.col }`,
			};

			return {
				category: 'rank 2',
				name: `m[${ u.row }, ${ u.col }]`,
				blurb: 'shape (6, 8) · stride (8, 1)',
				description: `offset = ${ u.row } · 8 + ${ u.col } = ${ u.index }. Click the matching slot on the tape below to see it from the buffer's side.`,
				metricLabel: 'value', metric: matrixValue( u.row, u.col ).toFixed( 4 ),
			};

		},
		update( dt ) {

			if ( step !== 2 && step !== 4 ) return;
			clock += dt;
			if ( clock < 0.09 ) return;
			clock = 0;
			if ( head >= N ) { paintAll(); head = 0; }
			mark( head );
			if ( head > 0 ) {

				const prev = orderIndex( head - 1 );
				paintCell( tape.userData.cells[ prev ], THEME.info, 0.55 );
				paintCell( cellAt( matrix, Math.floor( prev / COLS ), prev % COLS ), THEME.info, 0.5 );

			}
			head ++;

		},
	};

}
