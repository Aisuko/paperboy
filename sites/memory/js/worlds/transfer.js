import * as THREE from 'three';
import { addStandardLighting, createDeck, createLabel, THEME } from '../utils/sceneKit.js';
import { createStrip, createWall, createFrame, createRail, paintCell, cellMesh } from '../utils/tensorKit.js';
import { BY_KEY, LINKS, bytesOf, bitsPerValue, numel, SHAPES, fmtBytes, fmtTime } from '../data/formats.js';

// ── layout ────────────────────────────────────────────────────────────────
// host DRAM · CPU package · short PCIe link · GPU package (SMs · L2 · HBM)
const HOST_X = -12.4;
const IMC_X = -9.8;
const CORE_X = [ -8.35, -7.0, -5.65, -4.3 ];
const CORE_Y = 1.15;
const L3_X = -6.325;
const RC_X = -3.15;
const BUS_A = -2.6;
const BUS_B = 1.4;
const BUS_Y = -0.45;
const EP_X = 2.1;
const SM_X = [ 4.7, 6.3, 7.9, 9.5 ];
const SM_Y = [ 1.95, 0.45 ];
const GPU_X = 7.1;
const HBM_X = [ 3.3, 11.5 ];
const PACKETS = 12;

// one bandwidth figure per tier, TB/s
const BW = { ddr5: 0.4, creg: 1.0, cl1: 0.6, cl2: 0.3, l3: 1.0, hbm: 8, gl2: 10, smem: 30, greg: 100 };

const LINK_BY_KEY = Object.fromEntries( LINKS.map( ( l ) => [ l.key, l ] ) );

const VIEWS = [
	{ position: new THREE.Vector3( -12.4, 1.2, 8.5 ), target: new THREE.Vector3( -12.4, 0.6, 0 ) },
	{ position: new THREE.Vector3( -11.9, -1.1, 7.5 ), target: new THREE.Vector3( -11.9, -1.6, 0 ) },
	{ position: new THREE.Vector3( -4.0, 0.5, 14.5 ), target: new THREE.Vector3( -4.0, -0.15, 0 ) },
	{ position: new THREE.Vector3( 7.15, 0.9, 11.5 ), target: new THREE.Vector3( 7.15, 0.3, 0 ) },
	{ position: new THREE.Vector3( 7.1, 1.3, 7.5 ), target: new THREE.Vector3( 7.1, 0.8, 0 ) },
	{ position: new THREE.Vector3( -1.0, 3.2, 29 ), target: new THREE.Vector3( -1.0, 0.1, 0 ) },
];

// Establishing shot: host DRAM, CPU package, the bus and the GPU package in frame.
const OVERVIEW = { position: new THREE.Vector3( -1.0, 1.4, 27.5 ), target: new THREE.Vector3( -1.0, 0.15, 0 ) };

function slab( w, h, d, color, level = 0.35 ) {

	return new THREE.Mesh(
		new THREE.BoxGeometry( w, h, d ),
		new THREE.MeshStandardMaterial( { color, emissive: color, emissiveIntensity: level, roughness: 0.42, metalness: 0.15 } ),
	);

}

export function buildTransferWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 90, { y: -5.6, divisions: 90 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = [];

	// ── host DRAM ─────────────────────────────────────────────────────────
	const pages = createWall( { rows: 6, cols: 8, cell: 0.3, gap: 0.08, depth: 0.3 } );
	pages.position.set( HOST_X, 0.9, 0 );
	pages.userData.cells.forEach( ( m ) => ( m.userData.kind = 'page' ) );
	rig.add( pages );

	const pageFrame = createFrame( pages.userData.width + 0.3, pages.userData.height + 0.3 );
	pageFrame.position.copy( pages.position );
	rig.add( pageFrame );

	const pinned = createStrip( { count: 8, cell: 0.3, gap: 0.08, depth: 0.3 } );
	pinned.position.set( HOST_X, -1.6, 0 );
	pinned.userData.cells.forEach( ( m ) => ( m.userData.kind = 'pinned' ) );
	rig.add( pinned );

	const bounce = cellMesh( 0.55, 0.55, THEME.rose );
	bounce.position.set( -10.3, -1.6, 0 );
	bounce.userData = { kind: 'bounce' };
	rig.add( bounce );

	// memory bus, DRAM → integrated memory controller
	rig.add( createRail( new THREE.Vector3( HOST_X, BUS_Y, 0 ), new THREE.Vector3( -10.25, BUS_Y, 0 ) ) );

	// ── CPU package ───────────────────────────────────────────────────────
	const cpuFrame = createFrame( 8.0, 3.0 );
	cpuFrame.position.set( -6.6, 0.55, 0 );
	rig.add( cpuFrame );

	const imc = slab( 0.9, 0.5, 0.7, THEME.muted, 0.3 );
	imc.position.set( IMC_X, -0.45, 0 );
	imc.userData = { kind: 'imc' };
	rig.add( imc );

	const coreRegs = [];
	const coreL1s = [];
	const coreL2s = [];

	CORE_X.forEach( ( x, i ) => {

		const frame = createFrame( 1.28, 1.66 );
		frame.position.set( x, CORE_Y, 0 );
		rig.add( frame );

		const reg = slab( 1.05, 0.24, 0.34, THEME.accent );
		reg.position.set( x, CORE_Y + 0.58, 0 );
		reg.userData = { kind: 'creg', index: i };
		rig.add( reg );
		coreRegs.push( reg );

		const l1 = slab( 1.05, 0.3, 0.34, THEME.info );
		l1.position.set( x, CORE_Y + 0.16, 0 );
		l1.userData = { kind: 'cl1', index: i };
		rig.add( l1 );
		coreL1s.push( l1 );

		const l2 = slab( 1.05, 0.3, 0.34, THEME.violet );
		l2.position.set( x, CORE_Y - 0.32, 0 );
		l2.userData = { kind: 'cl2', index: i };
		rig.add( l2 );
		coreL2s.push( l2 );

		rig.add( createRail( new THREE.Vector3( x, -0.2, 0 ), new THREE.Vector3( x, 0.32, 0 ), { radius: 0.028 } ) );

	} );

	const l3 = slab( 5.5, 0.5, 0.95, THEME.rose );
	l3.position.set( L3_X, -0.45, 0 );
	l3.userData = { kind: 'l3' };
	rig.add( l3 );

	const rootComplex = slab( 0.9, 0.9, 0.7, THEME.muted, 0.3 );
	rootComplex.position.set( RC_X, -0.45, 0 );
	rootComplex.userData = { kind: 'rc' };
	rig.add( rootComplex );

	const cpuBoard = slab( 8.0, 0.22, 4.2, THEME.deck, 0.25 );
	cpuBoard.material.color.set( THEME.deck );
	cpuBoard.material.emissive.set( THEME.grid );
	cpuBoard.material.roughness = 0.8;
	cpuBoard.position.set( -6.6, -1.95, 0 );
	rig.add( cpuBoard );

	// ── PCIe link ─────────────────────────────────────────────────────────
	rig.add( createRail( new THREE.Vector3( BUS_A, BUS_Y, 0.5 ), new THREE.Vector3( BUS_B, BUS_Y, 0.5 ) ) );
	rig.add( createRail( new THREE.Vector3( BUS_A, BUS_Y, -0.5 ), new THREE.Vector3( BUS_B, BUS_Y, -0.5 ) ) );

	const packets = [];
	for ( let i = 0; i < PACKETS; i ++ ) {

		const p = cellMesh( 0.2, 0.2, THEME.accent );
		p.userData = { kind: 'packet', index: i, t: i / PACKETS };
		rig.add( p );
		packets.push( p );

	}

	// ── GPU package ───────────────────────────────────────────────────────
	const gpuFrame = createFrame( 11.0, 4.0 );
	gpuFrame.position.set( 7.4, 0.6, 0 );
	rig.add( gpuFrame );

	const endpoint = slab( 0.9, 0.9, 0.7, THEME.muted, 0.3 );
	endpoint.position.set( EP_X, -0.45, 0 );
	endpoint.userData = { kind: 'ep' };
	rig.add( endpoint );

	const smRegs = [];
	const smShared = [];

	SM_Y.forEach( ( y, r ) => SM_X.forEach( ( x, c ) => {

		const index = r * SM_X.length + c;

		const frame = createFrame( 1.42, 1.16 );
		frame.position.set( x, y, 0 );
		rig.add( frame );

		const reg = slab( 1.15, 0.26, 0.36, THEME.accent );
		reg.position.set( x, y + 0.28, 0 );
		reg.userData = { kind: 'greg', index };
		rig.add( reg );
		smRegs.push( reg );

		const shared = slab( 1.15, 0.34, 0.36, THEME.info );
		shared.position.set( x, y - 0.16, 0 );
		shared.userData = { kind: 'smem', index };
		rig.add( shared );
		smShared.push( shared );

	} ) );

	SM_X.forEach( ( x ) => rig.add( createRail( new THREE.Vector3( x, -0.5, 0 ), new THREE.Vector3( x, -0.13, 0 ), { radius: 0.028 } ) ) );

	const gl2 = slab( 6.4, 0.5, 0.95, THEME.violet );
	gl2.position.set( GPU_X, -0.75, 0 );
	gl2.userData = { kind: 'l2' };
	rig.add( gl2 );

	const stacks = HBM_X.map( ( x ) => {

		const m = slab( 0.95, 3.0, 0.95, THEME.signal, 0.3 );
		m.position.set( x, 1.0, 0 );
		m.userData = { kind: 'hbm' };
		rig.add( m );
		return m;

	} );

	rig.add( createRail( new THREE.Vector3( HBM_X[ 0 ], -0.75, 0 ), new THREE.Vector3( 3.95, -0.75, 0 ), { radius: 0.03 } ) );
	rig.add( createRail( new THREE.Vector3( 10.25, -0.75, 0 ), new THREE.Vector3( HBM_X[ 1 ], -0.75, 0 ), { radius: 0.03 } ) );

	const gpuBoard = slab( 11.0, 0.22, 4.6, THEME.deck, 0.25 );
	gpuBoard.material.color.set( THEME.deck );
	gpuBoard.material.emissive.set( THEME.grid );
	gpuBoard.material.roughness = 0.8;
	gpuBoard.position.set( 7.4, -1.95, 0 );
	rig.add( gpuBoard );

	interactables.push(
		pages, pinned, bounce, imc, l3, rootComplex, endpoint, gl2,
		...coreRegs, ...coreL1s, ...coreL2s, ...smRegs, ...smShared, ...stacks, ...packets,
	);

	// ── labels ────────────────────────────────────────────────────────────
	const labels = {};
	const label = ( key, text, cls, x, y, z = 0 ) => {

		const l = createLabel( text, cls );
		l.position.set( x, y, z );
		rig.add( l );
		labels[ key ] = l;

	};

	label( 'host', 'host RAM · pageable', 'label2d label2d-key', HOST_X, 2.4 );
	label( 'ddr', `DDR5 · ~${ BW.ddr5 } TB/s`, 'label2d label2d-dim', -11.5, -0.85 );
	label( 'pinned', 'page-locked · DMA can reach it', 'label2d label2d-dim', HOST_X, -2.4 );
	label( 'bounce', 'staging copy', 'label2d label2d-dim', -10.3, -2.4 );
	label( 'imc', 'IMC', 'label2d label2d-dim', IMC_X, 0.25 );
	label( 'cores', `cores · Reg ~${ BW.creg } · L1 ~${ BW.cl1 } · L2 ~${ BW.cl2 } TB/s`, 'label2d label2d-key', L3_X, 2.4 );
	label( 'l3', `shared L3 · ~${ BW.l3 } TB/s`, 'label2d label2d-dim', L3_X, -0.98 );
	label( 'cpu', 'CPU package', 'label2d label2d-key', -6.6, -1.6 );
	label( 'rc', 'PCIe root complex', 'label2d label2d-dim', RC_X, 0.3 );
	label( 'bus', '', 'label2d label2d-key', -0.6, 0.5 );
	label( 'time', '', 'label2d label2d-dim', -0.6, 0.02 );
	label( 'ep', 'copy engine', 'label2d label2d-dim', EP_X, 0.3 );
	label( 'hbm', `HBM3e · ~${ BW.hbm } TB/s`, 'label2d label2d-dim', HBM_X[ 0 ], 2.85 );
	label( 'hbm2', `HBM3e · ~${ BW.hbm } TB/s`, 'label2d label2d-dim', HBM_X[ 1 ], 2.85 );
	label( 'sms', `8 SMs · Reg ~${ BW.greg } · L1+SMEM ~${ BW.smem } TB/s`, 'label2d label2d-key', GPU_X, 2.9 );
	label( 'gl2', `L2 · ~${ BW.gl2 } TB/s`, 'label2d label2d-dim', GPU_X, -1.18 );
	label( 'die', 'GPU package · die + HBM', 'label2d label2d-key', 7.4, -1.6 );

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
		labels.bus.element.textContent = `${ link.name } · ${ link.gbs } GB/s · ${ ( link.gbs / 1000 ).toFixed( 3 ) } TB/s`;
		labels.time.element.textContent = `${ fmtBytes( m.bytes ) } of ${ format.name } · ${ fmtTime( m.seconds ) }${ isPinned ? '' : ' · staged' }`;
		bounce.visible = ! isPinned;
		labels.bounce.visible = ! isPinned;

		pages.userData.cells.forEach( ( c ) => paintCell( c, isPinned ? THEME.muted : THEME.info, isPinned ? 0.2 : 0.5 ) );
		pinned.userData.cells.forEach( ( c ) => paintCell( c, isPinned ? THEME.accent : THEME.muted, isPinned ? 0.7 : 0.2 ) );
		paintCell( bounce, THEME.rose, 0.6 );

		const hostHot = step <= 2;
		coreRegs.forEach( ( c ) => paintCell( c, THEME.accent, hostHot ? 0.6 : 0.2 ) );
		coreL1s.forEach( ( c ) => paintCell( c, THEME.info, hostHot ? 0.5 : 0.2 ) );
		coreL2s.forEach( ( c ) => paintCell( c, THEME.violet, hostHot ? 0.45 : 0.2 ) );
		l3.material.emissiveIntensity = hostHot ? 0.6 : 0.25;
		imc.material.emissiveIntensity = hostHot ? 0.5 : 0.25;
		rootComplex.material.emissiveIntensity = step === 2 ? 0.7 : 0.25;
		endpoint.material.emissiveIntensity = step === 2 ? 0.7 : 0.25;

		smRegs.forEach( ( c ) => paintCell( c, THEME.accent, step >= 4 ? 0.8 : 0.2 ) );
		smShared.forEach( ( c ) => paintCell( c, THEME.info, step >= 4 ? 0.7 : 0.2 ) );
		gl2.material.emissiveIntensity = step >= 4 ? 0.85 : 0.3;
		stacks.forEach( ( s ) => ( s.material.emissiveIntensity = step >= 3 ? 0.8 : 0.3 ) );
		packets.forEach( ( p ) => ( p.visible = step >= 2 ) );

	}

	render();

	return {
		scene,
		interactables,
		getStepView( i ) { return VIEWS[ i ]; },
		getOverview() { return OVERVIEW; },
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

			if ( u.kind === 'imc' ) return {
				category: 'CPU package', name: 'memory controller',
				blurb: `DDR5 channels · ~${ BW.ddr5 } TB/s`,
				description: 'The IMC is on the CPU die, not on a northbridge. Eight to twelve DDR5 channels at 5600–6400 MT/s give a server socket roughly 0.4 TB/s — twenty times less than the HBM sitting on the other side of the bus.',
				metricLabel: 'read from DDR5', metric: fmtTime( m.bytes / ( BW.ddr5 * 1e12 ) ),
			};

			if ( u.kind === 'creg' ) return {
				category: `CPU core ${ u.index }`, name: 'register file',
				blurb: `~${ BW.creg } TB/s`,
				description: 'A few hundred bytes of architectural state per core, plus a wider physical file behind renaming. Two 64-byte AVX-512 loads and a store per cycle at ~5 GHz is where the number comes from.',
				metricLabel: 'per core', metric: `~${ BW.creg } TB/s`,
			};

			if ( u.kind === 'cl1' ) return {
				category: `CPU core ${ u.index }`, name: 'L1 data cache',
				blurb: `32–48 KB · ~${ BW.cl1 } TB/s`,
				description: 'Private to the core, four to five cycles away. It is the CPU analogue of an SM\'s shared memory: small, fast, and the only tier that keeps up with the execution units.',
				metricLabel: 'per core', metric: `~${ BW.cl1 } TB/s`,
			};

			if ( u.kind === 'cl2' ) return {
				category: `CPU core ${ u.index }`, name: 'L2 cache',
				blurb: `1–2 MB · ~${ BW.cl2 } TB/s`,
				description: 'Still private to the core, about a dozen cycles away. Every level down trades roughly 3× the capacity for half the bandwidth — the same shape as the GPU hierarchy on the right.',
				metricLabel: 'per core', metric: `~${ BW.cl2 } TB/s`,
			};

			if ( u.kind === 'l3' ) return {
				category: 'CPU package', name: 'shared L3',
				blurb: `32–256 MB · ~${ BW.l3 } TB/s`,
				description: 'The last stop before DRAM, shared by every core and kept coherent across them. A tensor being built on the CPU streams through here on its way to the pinned buffer.',
				metricLabel: 'tensor vs L3', metric: `${ ( m.bytes / ( 96 * 2 ** 20 ) ).toFixed( 1 ) }× larger`,
			};

			if ( u.kind === 'rc' ) return {
				category: 'CPU package', name: 'PCIe root complex',
				blurb: 'where the lanes start',
				description: 'The root complex owns the sixteen lanes and translates host physical addresses for the device. A pinned buffer is one it can hand to the GPU\'s DMA engine without the kernel moving it mid-flight.',
				metricLabel: link.name, metric: `${ ( link.gbs / 1000 ).toFixed( 3 ) } TB/s`,
			};

			if ( u.kind === 'ep' ) return {
				category: 'GPU package', name: 'copy engine',
				blurb: 'DMA, independent of the SMs',
				description: 'The endpoint side of the link. Dedicated copy engines move bytes while the SMs keep computing, which is what makes copy_(non_blocking=True) on a second stream free rather than a stall.',
				metricLabel: 'this copy', metric: fmtTime( m.seconds ),
			};

			if ( u.kind === 'packet' ) return {
				category: link.name, name: 'bus traffic',
				blurb: `${ link.gbs } GB/s in one direction`,
				description: `${ link.note }. Packet speed here is on a log scale — HBM is 127× a PCIe 5.0 link, not the 2× it looks.`,
				metricLabel: 'this tensor', metric: fmtTime( m.seconds ),
			};

			if ( u.kind === 'hbm' ) return {
				category: 'device memory', name: 'HBM stack',
				blurb: `DRAM on the package · ~${ BW.hbm } TB/s`,
				description: 'Stacked DRAM beside the die, wired over a very wide bus: 3.35 TB/s on an H100, about 8 TB/s on a B200. Capacity is the reason a model must be quantised; bandwidth is the reason it stays fast once it is.',
				metricLabel: `read at ${ BW.hbm } TB/s`, metric: fmtTime( m.bytes / ( BW.hbm * 1e12 ) ),
			};

			if ( u.kind === 'l2' ) return {
				category: 'on die', name: 'L2 cache',
				blurb: `50–126 MB · ~${ BW.gl2 } TB/s`,
				description: 'One L2 shared by every SM, between HBM and the die. Weights streamed once per token get no reuse out of it — decode is bandwidth-bound, so the stored format sets the token rate.',
				metricLabel: 'tensor vs L2', metric: `${ ( m.bytes / ( 50 * 2 ** 20 ) ).toFixed( 0 ) }× larger`,
			};

			if ( u.kind === 'greg' ) return {
				category: `SM ${ u.index }`, name: 'register file',
				blurb: `256 KB per SM · ~${ BW.greg } TB/s`,
				description: 'The largest register file in the machine and the fastest tier in this picture. Occupancy is decided here: registers per thread times threads resident cannot exceed 64K 32-bit registers per SM.',
				metricLabel: 'bytes per element', metric: `${ bitsPerValue( format ) / 8 }`,
			};

			if ( u.kind === 'smem' ) return {
				category: `SM ${ u.index }`, name: 'L1 + shared memory',
				blurb: `up to 228 KB per SM · ~${ BW.smem } TB/s`,
				description: 'One physical SRAM block, split between hardware-managed L1 and software-managed shared memory. Tiling a matmul means staging blocks here so each byte fetched from HBM is reused many times.',
				metricLabel: 'vs HBM', metric: `${ ( BW.smem / BW.hbm ).toFixed( 1 ) }× faster`,
			};

			return {
				category: 'on die', name: 'streaming multiprocessor',
				blurb: 'registers, shared memory, tensor cores',
				description: 'Tensor cores only accept certain dtypes. FP8 arrived with Hopper and FP4 with Blackwell; anything older must upconvert first.',
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
				p.position.set( BUS_A + t * ( BUS_B - BUS_A ), BUS_Y, ( p.userData.index % 2 ? 0.5 : -0.5 ) );
				p.material.emissiveIntensity = 0.4 + Math.sin( flow * 4 + p.userData.index ) * 0.2 + burst * 0.5;

			} );

		},
	};

}
