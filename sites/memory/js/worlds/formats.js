import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { createStrip, createBar, setBar, paintCell, cellMesh } from '../utils/tensorKit.js';
import { FORMATS, BY_KEY, quantize, quantizeBlock, bitArray, fieldOf, bytesOf, bitsPerValue, numel, SHAPES, sci, GIB } from '../data/formats.js';

const X0 = -5.4;
const STEP = 0.36;
const ROW_Y = ( i ) => 3.2 - i * 1.15;
const CX = ( f ) => X0 + ( f.bits - 1 ) * STEP / 2;

const FIELD_COLOR = { sign: THEME.rose, exp: THEME.signal, frac: THEME.accent };

export const BLOCK = [ 0.42, -1.9, 0.08, 3.6, -0.7, 1.25, 0.03, -2.4, 0.9, 0.15, -0.55, 2.8, 0.34, -0.12, 1.6, -3.1 ];

const VIEWS = [
	{ position: new THREE.Vector3( 0.2, 0.6, 22 ), target: new THREE.Vector3( 0.2, 0.3, 0 ) },
	{ position: new THREE.Vector3( 0.6, 3.3, 16 ), target: new THREE.Vector3( 0.6, 3.2, 0 ) },
	{ position: new THREE.Vector3( -2.4, 2.1, 11 ), target: new THREE.Vector3( -2.4, 2.05, 0 ) },
	{ position: new THREE.Vector3( -2.4, 0.9, 11 ), target: new THREE.Vector3( -2.4, 0.9, 0 ) },
	{ position: new THREE.Vector3( -4.1, -0.8, 8 ), target: new THREE.Vector3( -4.1, -0.8, 0 ) },
	{ position: new THREE.Vector3( -2.4, -3.4, 12 ), target: new THREE.Vector3( -2.4, -3.5, 0 ) },
	{ position: new THREE.Vector3( 0, 4.0, -1.0 ), target: new THREE.Vector3( 0, 1.2, -13 ) },
	{ position: new THREE.Vector3( 13, 0.4, 15 ), target: new THREE.Vector3( 13, 0.2, 0 ) },
];

export function buildFormatsWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 90, { y: -6.4, divisions: 90 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = [];
	const rows = [];

	FORMATS.forEach( ( f, r ) => {

		const group = new THREE.Group();
		group.position.y = ROW_Y( r );
		rig.add( group );

		const cells = [];
		for ( let i = 0; i < f.bits; i ++ ) {

			const mesh = cellMesh( 0.3, 0.3 );
			mesh.position.x = X0 + i * STEP;
			mesh.userData = { kind: 'bit', format: f.key, bit: i, field: fieldOf( f, i ) };
			group.add( mesh );
			cells.push( mesh );

		}

		const name = createLabel( f.name, 'label2d label2d-key' );
		name.position.set( X0 - 1.5, 0, 0 );
		group.add( name );

		const read = createLabel( '', 'label2d label2d-dim' );
		read.position.set( X0 + f.bits * STEP + 1.5, 0, 0 );
		group.add( read );

		interactables.push( group );
		rows.push( { f, group, cells, read, name } );

	} );

	const head = new THREE.Group();
	head.position.y = ROW_Y( 0 ) + 0.55;
	rig.add( head );
	[ [ 'sign', X0 ], [ 'exponent · range', X0 + 4.5 * STEP ], [ 'fraction · precision', X0 + 20 * STEP ] ].forEach( ( [ t, x ] ) => {

		const l = createLabel( t, 'label2d label2d-dim' );
		l.position.set( x, 0, 0 );
		head.add( l );

	} );

	const block = new THREE.Group();
	block.position.set( 0, -4.5, 0 );
	rig.add( block );

	const blockCells = createStrip( { count: 16, cell: 0.34, gap: 0.08, depth: 0.34 } );
	blockCells.position.set( -2.6, 0, 0 );
	blockCells.userData.cells.forEach( ( m ) => ( m.userData.kind = 'blockcell' ) );
	block.add( blockCells );

	const scaleCell = cellMesh( 0.5, 0.5, THEME.violet );
	scaleCell.position.set( 1.4, 0, 0 );
	scaleCell.userData = { kind: 'scale' };
	block.add( scaleCell );

	const blockLabel = createLabel( '', 'label2d label2d-key' );
	blockLabel.position.set( -2.6, 0.65, 0 );
	block.add( blockLabel );

	const scaleLabel = createLabel( 'E4M3 scale · 8 bits per 16 values', 'label2d label2d-dim' );
	scaleLabel.position.set( 2.9, 0.65, 0 );
	block.add( scaleLabel );

	interactables.push( blockCells, scaleCell );

	const bars = new THREE.Group();
	bars.position.set( 0, -0.6, -13 );
	rig.add( bars );

	const barSet = FORMATS.map( ( f, i ) => {

		const bar = createBar( { width: 1.0, depth: 1.0, color: i < 3 ? THEME.info : i < 5 ? THEME.accent : THEME.signal } );
		bar.position.x = ( i - 2.5 ) * 2;
		bar.userData = { kind: 'bar', format: f.key };
		bars.add( bar );

		const cap = createLabel( '', 'label2d label2d-key' );
		cap.position.set( bar.position.x, 0, 0 );
		bars.add( cap );

		const foot = createLabel( f.short, 'label2d label2d-dim' );
		foot.position.set( bar.position.x, -0.45, 0 );
		bars.add( foot );

		return { f, bar, cap };

	} );

	interactables.push( bars );

	const shapeLabel = createLabel( '', 'label2d label2d-key' );
	shapeLabel.position.set( 0, 5.4, -13 );
	rig.add( shapeLabel );

	const ladder = new THREE.Group();
	ladder.position.set( 13, 0, 0 );
	rig.add( ladder );

	const DEC = 0.075;
	FORMATS.forEach( ( f, i ) => {

		const lo = Math.log10( f.minNormal ) * DEC;
		const hi = Math.log10( f.max ) * DEC;
		const w = 0.12 + f.m * 0.055;
		const col = new THREE.Mesh(
			new THREE.BoxGeometry( w, hi - lo, w ),
			new THREE.MeshStandardMaterial( { color: THEME.accent, emissive: THEME.accent, emissiveIntensity: 0.35, roughness: 0.4, transparent: true, opacity: 0.9 } ),
		);
		col.position.set( ( i - 2.5 ) * 1.7, ( lo + hi ) / 2, 0 );
		col.userData = { kind: 'range', format: f.key };
		ladder.add( col );

		const tag = createLabel( f.short, 'label2d label2d-dim' );
		tag.position.set( col.position.x, hi + 0.35, 0 );
		ladder.add( tag );

	} );

	const unity = new THREE.Mesh(
		new THREE.BoxGeometry( 10, 0.02, 0.02 ),
		new THREE.MeshBasicMaterial( { color: THEME.muted, transparent: true, opacity: 0.8 } ),
	);
	ladder.add( unity );
	const unityLabel = createLabel( '1.0', 'label2d label2d-dim' );
	unityLabel.position.set( -5.4, 0, 0 );
	ladder.add( unityLabel );

	interactables.push( ladder );

	let step = 0;
	let value = 3.14159;
	let shape = 0;
	let state = {};

	function renderRows() {

		state.q = {};
		rows.forEach( ( { f, cells, read } ) => {

			const q = quantize( value, f );
			state.q[ f.key ] = q;
			const bits = bitArray( q, f );
			cells.forEach( ( m, i ) => paintCell( m, FIELD_COLOR[ m.userData.field ], bits[ i ] ? 1 : 0.06 ) );
			const err = q.flag === 'overflow' ? 'overflow' : q.flag === 'underflow' ? 'flushed to 0' : `${ ( q.error * 100 ).toFixed( q.error < 0.001 ? 4 : 2 ) }%`;
			read.element.textContent = `${ sci( q.value ) }   ${ err }`;
			read.element.className = 'label2d ' + ( q.flag === 'overflow' || q.flag === 'underflow' ? 'label2d-key' : 'label2d-dim' );

		} );

	}

	function renderBlock() {

		const b = quantizeBlock( BLOCK, BY_KEY.nvfp4 );
		state.block = b;
		blockCells.userData.cells.forEach( ( m, i ) => paintCell( m, b.cells[ i ].value === 0 ? THEME.muted : THEME.accent, 0.2 + Math.abs( b.cells[ i ].value ) / 6 * 0.8 ) );
		paintCell( scaleCell, THEME.violet, 0.75 );
		blockLabel.element.textContent = `16 values · amax ${ b.amax } · scale ${ b.scale }`;

	}

	function renderBars() {

		const s = SHAPES[ shape ];
		const n = numel( s.dims );
		state.shape = s;
		state.numel = n;
		state.bytes = {};
		barSet.forEach( ( { f, bar, cap } ) => {

			const bytes = bytesOf( n, f );
			state.bytes[ f.key ] = bytes;
			const h = bytes / GIB * 1.8;
			setBar( bar, h );
			cap.position.y = h + 0.35;
			cap.element.textContent = `${ ( bytes / GIB ).toFixed( 3 ) } GiB`;

		} );
		shapeLabel.element.textContent = `${ s.label } (${ s.dims[ 0 ].toLocaleString( 'en-AU' ) } × ${ s.dims[ 1 ].toLocaleString( 'en-AU' ) }) · ${ n.toLocaleString( 'en-AU' ) } elements`;

	}

	const STEP_ROWS = { 1: [ 0 ], 2: [ 1 ], 3: [ 2 ], 4: [ 3, 4 ], 5: [ 5 ] };

	function render() {

		rows.forEach( ( _, i ) => {

			const lit = step === 0 || step >= 6 || ( STEP_ROWS[ step ] || [] ).includes( i );
			rows[ i ].name.element.className = 'label2d ' + ( lit ? 'label2d-key' : 'label2d-dim' );

		} );

		block.visible = step >= 5;
		bars.visible = step >= 6;
		shapeLabel.visible = step >= 6;
		ladder.visible = step === 7 || step === 0;
		head.visible = step <= 1;

	}

	renderRows();
	renderBlock();
	renderBars();
	render();

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ i ]; },
		setStep( i ) { step = i; render(); },
		setValue( v ) { value = v; renderRows(); return state; },
		setShape( i ) { shape = i; renderBars(); return state; },
		getState() { return { ...state, value, shape: SHAPES[ shape ], step }; },
		describe( object ) {

			const u = object.userData;

			if ( u.kind === 'bit' ) {

				const f = BY_KEY[ u.format ];
				const q = state.q[ u.format ];
				const bits = bitArray( q, f );
				const on = bits[ u.bit ] === 1;
				if ( u.field === 'sign' ) return {
					category: f.name, name: 'sign bit',
					blurb: on ? 'negative' : 'positive',
					description: 'One bit, the same in every float format. Sign-magnitude, not two\'s complement — which is why there is a −0.',
					metricLabel: 'bit', metric: on ? '1' : '0',
				};
				if ( u.field === 'exp' ) {

					return {
						category: f.name, name: `exponent bit ${ u.bit } / ${ f.e }`,
						blurb: `weight ${ 2 ** ( f.e - u.bit ) } in the stored field`,
						description: `The field holds ${ q.expField }; subtract the bias ${ f.bias } to get the real exponent ${ q.sub ? 1 - f.bias : q.expField - f.bias }. ${ f.mode === 'ieee' ? `All ${ f.e } bits set is reserved for inf and NaN.` : f.mode === 'fn' ? `All ${ f.e } bits set stays finite except the one pattern with every fraction bit set, which is NaN — that is what buys E4M3 its 448.` : 'No pattern is reserved — every code is a finite value.' }`,
						metricLabel: 'exponent field', metric: `${ q.expField } → 2^${ q.sub ? 1 - f.bias : q.expField - f.bias }`,
					};

				}

				const k = u.bit - f.e;
				return {
					category: f.name, name: `fraction bit ${ k + 1 } / ${ f.m }`,
					blurb: `adds 2^−${ k + 1 } of the octave`,
					description: `Fraction bits set the spacing inside a power of two. With ${ f.m } of them the gap between neighbours at 1.0 is ${ sci( f.eps ) }, about ${ f.digits.toFixed( 1 ) } decimal digits.`,
					metricLabel: 'fraction field', metric: `${ q.mantField } / ${ 2 ** f.m }`,
				};

			}

			if ( u.kind === 'blockcell' ) {

				const c = state.block.cells[ u.index ];
				return {
					category: 'nvfp4 block', name: `element ${ u.index }`,
					blurb: `stored as ${ c.value } × scale`,
					description: `Original ${ BLOCK[ u.index ] }, divided by the block scale ${ state.block.scale }, rounded to one of the 16 E2M1 codes, then multiplied back: ${ ( c.value * state.block.scale ).toFixed( 4 ) }.`,
					metricLabel: 'error', metric: c.flag === 'underflow' ? 'flushed to 0' : `${ ( Math.abs( c.value * state.block.scale - BLOCK[ u.index ] ) / Math.abs( BLOCK[ u.index ] ) * 100 ).toFixed( 2 ) }%`,
				};

			}

			if ( u.kind === 'scale' ) return {
				category: 'nvfp4 block', name: 'block scale',
				blurb: 'one FP8 E4M3 value per 16 elements',
				description: `The block\'s largest magnitude is ${ state.block.amax }; dividing by 6 (the largest E2M1 code) and rounding to E4M3 gives ${ state.block.scale }. Eight bits over 16 values is the half a bit that makes nvfp4 4.5 bits per value.`,
				metricLabel: 'scale', metric: `${ state.block.scale }`,
			};

			if ( u.kind === 'bar' ) {

				const f = BY_KEY[ u.format ];
				const bytes = state.bytes[ u.format ];
				return {
					category: state.shape.label, name: f.name,
					blurb: `${ bitsPerValue( f ) } bits per value`,
					description: `${ state.numel.toLocaleString( 'en-AU' ) } elements × ${ bitsPerValue( f ) } bits = ${ ( bytes / 1e9 ).toFixed( 3 ) } GB. That is ${ ( bytesOf( state.numel, BY_KEY.fp32 ) / bytes ).toFixed( 2 ) }× smaller than float32.`,
					metricLabel: 'size', metric: `${ ( bytes / GIB ).toFixed( 3 ) } GiB`,
				};

			}

			if ( u.kind === 'range' ) {

				const f = BY_KEY[ u.format ];
				return {
					category: 'range and precision', name: f.name,
					blurb: `${ f.e } exponent bits · ${ f.m } fraction bits`,
					description: `Normal values run from ${ sci( f.minNormal ) } to ${ sci( f.max ) } — ${ ( Math.log10( f.max ) - Math.log10( f.minNormal ) ).toFixed( 1 ) } decades, drawn as the height. Width is precision: the step at 1.0 is ${ sci( f.eps ) }.`,
					metricLabel: 'decimal digits', metric: f.digits.toFixed( 1 ),
				};

			}

			return null;

		},
		update() {},
	};

}
