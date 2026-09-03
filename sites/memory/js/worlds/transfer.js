import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { createStrip, createWall, createFrame, createRail, paintCell, cellMesh } from '../utils/tensorKit.js';
import { BY_KEY, LINKS, bytesOf, bitsPerValue, numel, SHAPES, fmtBytes, fmtTime } from '../data/formats.js';

const BUS_A = -8.4;
const BUS_B = 6.4;
const PACKETS = 16;

const LINK_BY_KEY = Object.fromEntries( LINKS.map( ( l ) => [ l.key, l ] ) );

const VIEWS = [
	{ position: new THREE.Vector3( -11, 1.2, 9 ), target: new THREE.Vector3( -11, 0.2, 0 ) },
	{ position: new THREE.Vector3( -10.2, -0.4, 8.5 ), target: new THREE.Vector3( -10.2, -0.9, 0 ) },
	{ position: new THREE.Vector3( -1.2, 1.8, 13 ), target: new THREE.Vector3( -1.2, -0.1, 0 ) },
	{ position: new THREE.Vector3( 9.5, 1.2, 12 ), target: new THREE.Vector3( 9.5, -0.2, 0 ) },
	{ position: new THREE.Vector3( 9.5, 0.6, 7 ), target: new THREE.Vector3( 9.5, 0.3, 0 ) },
	{ position: new THREE.Vector3( 0, 4.0, 27 ), target: new THREE.Vector3( 0, -0.3, 0 ) },
];

export function buildTransferWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 90, { y: -5.6, divisions: 90 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = [];

	const pages = createWall( { rows: 6, cols: 8, cell: 0.3, gap: 0.08, depth: 0.3 } );
	pages.position.set( -11, 0.9, 0 );
	pages.userData.cells.forEach( ( m ) => ( m.userData.kind = 'page' ) );
	rig.add( pages );

	const pageFrame = createFrame( pages.userData.width + 0.3, pages.userData.height + 0.3 );
	pageFrame.position.copy( pages.position );
	rig.add( pageFrame );

	const pinned = createStrip( { count: 8, cell: 0.3, gap: 0.08, depth: 0.3 } );
	pinned.position.set( -11, -1.6, 0 );
	pinned.userData.cells.forEach( ( m ) => ( m.userData.kind = 'pinned' ) );
	rig.add( pinned );

	const bounce = cellMesh( 0.55, 0.55, THEME.rose );
	bounce.position.set( -9.2, -1.6, 0 );
	bounce.userData = { kind: 'bounce' };
	rig.add( bounce );

	rig.add( createRail( new THREE.Vector3( BUS_A, -0.1, 0.55 ), new THREE.Vector3( BUS_B, -0.1, 0.55 ) ) );
	rig.add( createRail( new THREE.Vector3( BUS_A, -0.1, -0.55 ), new THREE.Vector3( BUS_B, -0.1, -0.55 ) ) );

	const packets = [];
	for ( let i = 0; i < PACKETS; i ++ ) {

		const p = cellMesh( 0.22, 0.22, THEME.accent );
		p.userData = { kind: 'packet', index: i, t: i / PACKETS };
		rig.add( p );
		packets.push( p );

	}

	const die = createWall( { rows: 6, cols: 6, cell: 0.34, gap: 0.08, depth: 0.22 } );
	die.position.set( 9.5, 0.4, 0 );
	die.userData.cells.forEach( ( m ) => ( m.userData.kind = 'sm' ) );
	rig.add( die );

	const dieFrame = createFrame( die.userData.width + 0.35, die.userData.height + 0.35 );
	dieFrame.position.copy( die.position );
	rig.add( dieFrame );

	const l2 = new THREE.Mesh(
		new THREE.BoxGeometry( 3.0, 0.24, 0.6 ),
		new THREE.MeshStandardMaterial( { color: THEME.violet, emissive: THEME.violet, emissiveIntensity: 0.4, roughness: 0.4 } ),
	);
	l2.position.set( 9.5, -1.1, 0 );
	l2.userData = { kind: 'l2' };
	rig.add( l2 );

	const stacks = [ -1, 1 ].map( ( s ) => {

		const m = new THREE.Mesh(
			new THREE.BoxGeometry( 0.9, 2.2, 0.9 ),
			new THREE.MeshStandardMaterial( { color: THEME.info, emissive: THEME.info, emissiveIntensity: 0.35, roughness: 0.4 } ),
		);
		m.position.set( 9.5 + s * 2.6, 0.3, 0 );
		m.userData = { kind: 'hbm' };
		rig.add( m );
		return m;

	} );

	const board = new THREE.Mesh(
		new THREE.BoxGeometry( 7.6, 0.22, 4.2 ),
		new THREE.MeshStandardMaterial( { color: THEME.deck, emissive: THEME.grid, emissiveIntensity: 0.25, roughness: 0.8 } ),
	);
	board.position.set( 9.5, -1.6, 0 );
	rig.add( board );

	interactables.push( pages, pinned, bounce, die, l2, ...stacks, ...packets );

	const labels = {};
	const label = ( key, text, cls, x, y, z = 0 ) => {

		const l = createLabel( text, cls );
		l.position.set( x, y, z );
		rig.add( l );
		labels[ key ] = l;

	};

	label( 'host', 'host RAM · pageable', 'label2d label2d-key', -11, 2.2 );
	label( 'pinned', 'page-locked · DMA can reach it', 'label2d label2d-dim', -11, -2.3 );
	label( 'bounce', 'staging copy', 'label2d label2d-dim', -9.2, -2.3 );
	label( 'bus', '', 'label2d label2d-key', -1, 0.9 );
	label( 'time', '', 'label2d label2d-dim', -1, 0.4 );
	label( 'hbm', 'HBM stacks', 'label2d label2d-dim', 9.5, 1.8 );
	label( 'die', 'GPU die · SMs', 'label2d label2d-key', 9.5, -1.9 );
	label( 'l2', 'L2', 'label2d label2d-dim', 11.6, -1.1 );

	let step = 0;
	let link = LINK_BY_KEY.pcie5;
	let format = BY_KEY.fp32;
	let shape = 0;
	let isPinned = true;
	let flow = 0;
	let burst = 0;

	function metrics() {

		const n = numel( SHAPES[ shape ].dims );
		const bytes = bytesOf( n, format );
		const eff = isPinned ? 1 : 0.45;
		return { n, bytes, seconds: bytes / ( link.gbs * 1e9 * eff ), eff, effective: link.gbs * eff };

	}

	function render() {

		const m = metrics();
		labels.bus.element.textContent = `${ link.name } · ${ link.gbs } GB/s`;
		labels.time.element.textContent = `${ fmtBytes( m.bytes ) } of ${ format.name } · ${ fmtTime( m.seconds ) }${ isPinned ? '' : ' · staged' }`;
		bounce.visible = ! isPinned;
		labels.bounce.visible = ! isPinned;

		pages.userData.cells.forEach( ( c ) => paintCell( c, isPinned ? THEME.muted : THEME.info, isPinned ? 0.2 : 0.5 ) );
		pinned.userData.cells.forEach( ( c ) => paintCell( c, isPinned ? THEME.accent : THEME.muted, isPinned ? 0.7 : 0.2 ) );
		paintCell( bounce, THEME.rose, 0.6 );
		die.userData.cells.forEach( ( c ) => paintCell( c, THEME.accent, step >= 4 ? 0.55 : 0.2 ) );
		l2.material.emissiveIntensity = step >= 4 ? 0.8 : 0.3;
		stacks.forEach( ( s ) => ( s.material.emissiveIntensity = step >= 3 ? 0.7 : 0.3 ) );
		packets.forEach( ( p ) => ( p.visible = step >= 2 ) );

	}

	render();

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ i ]; },
		setStep( i ) { step = i; render(); },
		setLink( key ) { link = LINK_BY_KEY[ key ]; render(); return metrics(); },
		setFormat( key ) { format = BY_KEY[ key ]; render(); return metrics(); },
		setShape( i ) { shape = i; render(); return metrics(); },
		setPinned( v ) { isPinned = v; render(); return metrics(); },
		fire() { burst = 1.6; return metrics(); },
		getState() { return { link, format, isPinned, shape: SHAPES[ shape ], ...metrics() }; },
		describe( object ) {

			const u = object.userData;
			const m = metrics();

			if ( u.kind === 'page' ) return {
				category: 'host memory', name: `page ${ u.index }`,
				blurb: '4 KiB of pageable virtual memory',
				description: 'The kernel may move or swap this page at any time, so a DMA engine cannot be handed its address. Pageable buffers are copied into a driver-owned pinned buffer first.',
				metricLabel: 'tensor pages', metric: `${ Math.ceil( m.bytes / 4096 ).toLocaleString( 'en-AU' ) }`,
			};

			if ( u.kind === 'pinned' ) return {
				category: 'host memory', name: 'page-locked buffer',
				blurb: 'physical pages nailed down',
				description: 'cudaHostAlloc, or .pin_memory() in PyTorch. The DMA engine reads it directly and the copy can be asynchronous, overlapping with compute on another stream. Pinning too much starves the OS.',
				metricLabel: 'this copy, pinned', metric: fmtTime( m.bytes / ( link.gbs * 1e9 ) ),
			};

			if ( u.kind === 'bounce' ) return {
				category: 'driver', name: 'staging buffer',
				blurb: 'the copy you did not ask for',
				description: `A pageable transfer is a host-to-host memcpy into this buffer, then a DMA out of it. The extra pass is why the same copy lands at roughly half the bus rate: ${ fmtTime( m.bytes / ( link.gbs * 1e9 ) ) } becomes ${ fmtTime( m.bytes / ( link.gbs * 1e9 * 0.45 ) ) }.`,
				metricLabel: 'penalty', metric: '≈ 2×',
			};

			if ( u.kind === 'packet' ) return {
				category: link.name, name: 'bus traffic',
				blurb: `${ link.gbs } GB/s in one direction`,
				description: `${ link.note }. Packet speed here is on a log scale — HBM is 127× a PCIe 5.0 link, not the 2× it looks.`,
				metricLabel: 'this tensor', metric: fmtTime( m.seconds ),
			};

			if ( u.kind === 'hbm' ) return {
				category: 'device memory', name: 'HBM stack',
				blurb: 'DRAM on the GPU package',
				description: 'Stacked DRAM beside the die, wired over a very wide bus: 3.35 TB/s on an H100, about 8 TB/s on a B200. Capacity is the reason a model must be quantised; bandwidth is the reason it stays fast once it is.',
				metricLabel: 'read at 8 TB/s', metric: fmtTime( m.bytes / 8e12 ),
			};

			if ( u.kind === 'l2' ) return {
				category: 'on die', name: 'L2 cache',
				blurb: 'tens of MB, shared by every SM',
				description: 'Between HBM and the SMs. Weights streamed once per token get no reuse out of it — decode is bandwidth-bound, so the stored format sets the token rate.',
				metricLabel: 'tensor vs L2', metric: `${ ( m.bytes / ( 50 * 2 ** 20 ) ).toFixed( 0 ) }× larger`,
			};

			return {
				category: 'on die', name: `SM ${ u.index }`,
				blurb: 'registers and shared memory',
				description: 'Each streaming multiprocessor has its own register file and shared memory, and tensor cores that only accept certain dtypes. FP8 arrived with Hopper and FP4 with Blackwell; anything older must upconvert first.',
				metricLabel: 'bytes per element', metric: `${ bitsPerValue( format ) / 8 }`,
			};

		},
		update( dt ) {

			if ( step < 2 ) return;
			const speed = ( 1.1 + Math.log10( link.gbs ) * 1.5 ) * ( isPinned ? 1 : 0.55 ) * ( 1 + burst * 1.4 );
			burst = Math.max( 0, burst - dt );
			flow += dt;
			packets.forEach( ( p ) => {

				p.userData.t = ( p.userData.t + dt * speed / ( BUS_B - BUS_A ) ) % 1;
				const t = p.userData.t;
				p.position.set( BUS_A + t * ( BUS_B - BUS_A ), -0.1, ( p.userData.index % 2 ? 0.55 : -0.55 ) );
				p.material.emissiveIntensity = 0.4 + Math.sin( flow * 4 + p.userData.index ) * 0.2 + burst * 0.5;

			} );

		},
	};

}
