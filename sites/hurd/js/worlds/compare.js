import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getComponent, CATEGORIES } from '../data/components.js';
import { createComponentObject, setNodeState, animateComponent } from '../components3d.js';
import { addStandardLighting, createDeck, THEME, EMISSIVE, shellColor } from '../utils/sceneKit.js';
import { IPCLink } from '../utils/ipcLink.js';
import { tween, Easing } from '../utils/tween.js';

// Three-column layout modelled on references/screenshots/kernel_structure.png:
// an "Application" block sits in user mode at the top of every column, a
// kernel/user-mode boundary line runs underneath it, and each kernel style
// arranges its own services relative to that line —
//   monolithic: everything fused into one block, entirely in kernel mode.
//   microkernel: each service is its own process in user mode, sat on a
//     minimal kernel (IPC/VM/scheduling) that alone lives in kernel mode.
//   hybrid: the same services, but the file server & "UNIX" personality
//     server are pulled back down into kernel mode for performance.
const COL_X = { mono: -4.9, micro: 0, hybrid: 4.9 };
const APP_Y = 3.1;
const BOUNDARY_Y = 1.35;
const USER_ROW_Y = 2.0;
const KERNEL_ROW_Y = 0.5;
const BASE_Y = -2.2;

const MONO_LAYERS = [
	{ label: 'VFS, system call', color: THEME.signal },
	{ label: 'IPC, file system', color: THEME.violet },
	{ label: 'Scheduler, virtual memory', color: THEME.info },
	{ label: 'Device drivers, dispatcher, …', color: THEME.muted },
];

// The Hurd's real servers standing in for the textbook microkernel roles.
const MICRO_SERVERS = [
	{ role: 'App IPC', componentId: 'exec' },
	{ role: 'UNIX server', componentId: 'proc' },
	{ role: 'Driver', componentId: 'pfinet' },
	{ role: 'File server', componentId: 'ext2fs' },
];

// No single real OS is "the" hybrid kernel, so these four roles are drawn
// generically — matched in shape & color to their MICRO_SERVERS counterpart
// above, so the only visual difference between the two columns is which two
// services dip into kernel mode.
const HYBRID_SERVERS = [
	{ role: 'App IPC', id: 'hybrid-app-ipc', category: 'core', shape: 'server', inKernel: false },
	{ role: 'UNIX server', id: 'hybrid-unix', category: 'core', shape: 'server', inKernel: true },
	{ role: 'Driver', id: 'hybrid-driver', category: 'network', shape: 'antenna', inKernel: false },
	{ role: 'File server', id: 'hybrid-file', category: 'filesystem', shape: 'disk', inKernel: true },
];

const APP_COLOR = THEME.ok;

function addLabel( parent, text, y, extraClass, x = 0 ) {

	const label = document.createElement( 'div' );
	label.className = extraClass ? `label2d ${ extraClass }` : 'label2d';
	label.textContent = text;
	const labelObj = new CSS2DObject( label );
	labelObj.position.set( x, y, 0 );
	parent.add( labelObj );
	return labelObj;

}

function buildAppNode() {

	const group = new THREE.Group();
	const geo = new RoundedBoxGeometry( 1.05, 0.4, 0.6, 3, 0.07 );
	const body = new THREE.Mesh( geo, new THREE.MeshStandardMaterial( {
		color: shellColor( APP_COLOR, THEME.shell2 ), emissive: APP_COLOR, emissiveIntensity: 0.4 * EMISSIVE, metalness: 0.55, roughness: 0.3,
	} ) );
	group.add( body );
	group.add( new THREE.LineSegments(
		new THREE.EdgesGeometry( geo ),
		new THREE.LineBasicMaterial( { color: APP_COLOR, transparent: true, opacity: 0.65 } ),
	) );
	group.userData.spin = 0.1;
	return group;

}

// A thin glowing line marking the kernel/user-mode boundary, with the two
// small mode labels from the reference diagram.
function buildBoundary( halfWidth ) {

	const group = new THREE.Group();
	const geo = new THREE.BufferGeometry().setFromPoints( [
		new THREE.Vector3( -halfWidth, 0, 0 ), new THREE.Vector3( halfWidth, 0, 0 ),
	] );
	const line = new THREE.Line( geo, new THREE.LineBasicMaterial( { color: THEME.edge, transparent: true, opacity: 0.3 } ) );
	group.add( line );
	group.position.y = BOUNDARY_Y;

	// Sit these off to the side of the boxes, like the reference diagram,
	// instead of floating over whatever is stacked at x=0.
	const side = new THREE.Group();
	side.position.x = -halfWidth - 0.35;
	addLabel( side, 'user mode', 0.3, 'label2d-dim' );
	addLabel( side, 'kernel mode', -0.3, 'label2d-dim' );
	group.add( side );

	return group;

}

function buildMonolith() {

	const group = new THREE.Group();
	const h = 0.42;
	const layerMeshes = [];

	MONO_LAYERS.forEach( ( layer, i ) => {

		const mat = new THREE.MeshStandardMaterial( {
			color: shellColor( layer.color, THEME.shell2 ), emissive: layer.color, emissiveIntensity: 0.32 * EMISSIVE, metalness: 0.6, roughness: 0.35,
		} );
		const mesh = new THREE.Mesh( new THREE.BoxGeometry( 1.9, h, 1.9 ), mat );
		mesh.position.y = -1.9 + i * h;
		group.add( mesh );
		layerMeshes.push( mesh );

		addLabel( mesh, layer.label, 0, 'label2d-dim', 1.35 );

	} );

	const outline = new THREE.LineSegments(
		new THREE.EdgesGeometry( new THREE.BoxGeometry( 1.92, h * 4, 1.92 ) ),
		new THREE.LineBasicMaterial( { color: THEME.edge, transparent: true, opacity: 0.35 } ),
	);
	outline.position.y = -1.9 + h * 1.5;
	group.add( outline );

	return { group, layerMeshes };

}

function buildServerRow( servers, resolveComponent ) {

	const nodes = [];
	const spacing = 1.3;
	const offset = ( ( servers.length - 1 ) * spacing ) / 2;

	servers.forEach( ( spec, i ) => {

		const comp = resolveComponent( spec );
		const obj = createComponentObject( comp );
		setNodeState( obj, 'done' );
		obj.scale.setScalar( 0.72 );
		obj.position.x = i * spacing - offset;
		obj.position.y = spec.inKernel ? KERNEL_ROW_Y : USER_ROW_Y;
		obj.userData.role = spec.role;
		// Stagger label height so neighbouring roles in a row never collide.
		addLabel( obj, spec.role, i % 2 === 0 ? 0.66 : -0.62, 'label2d-dim' );
		nodes.push( obj );

	} );

	return nodes;

}

function buildColumn( kind ) {

	const group = new THREE.Group();
	group.position.x = COL_X[ kind ];

	const appNode = buildAppNode();
	appNode.position.y = APP_Y;
	group.add( appNode );
	addLabel( appNode, 'Application', 0.42, 'label2d-dim' );

	const links = [];
	let layerMeshes = null;
	let baseNode = null;
	let serverNodes = null;

	if ( kind === 'mono' ) {

		group.add( buildBoundary( 1.3 ) );

		const mono = buildMonolith();
		group.add( mono.group );
		layerMeshes = mono.layerMeshes;

		links.push( new IPCLink( group, new THREE.Vector3( 0, -1.9 + 0.42 * 3.5, 0 ), appNode.position.clone(), THEME.signal, {
			particleCount: 2, speed: 0.32, radius: 0.016, arc: 0.5,
		} ) );

	} else {

		group.add( buildBoundary( 2.7 ) );

		const specs = kind === 'micro' ? MICRO_SERVERS : HYBRID_SERVERS;
		const resolve = kind === 'micro'
			? ( spec ) => getComponent( spec.componentId )
			: ( spec ) => ( { id: spec.id, name: spec.role, category: spec.category, shape: spec.shape } );

		serverNodes = buildServerRow( specs.map( ( s ) => ( { ...s, inKernel: kind === 'hybrid' ? s.inKernel : false } ) ), resolve );
		serverNodes.forEach( ( node ) => group.add( node ) );

		const baseComp = kind === 'micro'
			? getComponent( 'gnu-mach' )
			: { id: 'hybrid-base', name: 'Basic IPC, Virtual Memory, Scheduling', category: 'kernel', shape: 'core' };
		baseNode = createComponentObject( baseComp );
		setNodeState( baseNode, 'active' );
		baseNode.scale.setScalar( 0.62 );
		baseNode.position.y = BASE_Y;
		group.add( baseNode );
		addLabel( baseNode, 'Basic IPC · virtual memory · scheduling', -0.55, 'label2d-dim' );

		serverNodes.forEach( ( node ) => {

			const color = CATEGORIES[ node.userData.category ] ? CATEGORIES[ node.userData.category ].color : THEME.accent;
			links.push( new IPCLink( group, appNode.position.clone(), node.position.clone(), color, {
				particleCount: 1, speed: 0.3, radius: 0.014, arc: 0.4,
			} ) );
			links.push( new IPCLink( group, node.position.clone(), baseNode.position.clone(), color, {
				particleCount: 1, speed: 0.3, radius: 0.014, arc: 0.4,
			} ) );

		} );

	}

	return { group, appNode, layerMeshes, baseNode, serverNodes, links };

}

function tweenAsync( duration, onUpdate, opts = {} ) {

	return new Promise( ( resolve ) => {

		tween( duration, onUpdate, {
			...opts,
			onComplete: () => { if ( opts.onComplete ) opts.onComplete(); resolve(); },
		} );

	} );

}

function wait( ms ) {

	return new Promise( ( resolve ) => setTimeout( resolve, ms ) );

}

export function buildCompareWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 26, { y: -1.7, divisions: 40 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const monoCol = buildColumn( 'mono' );
	const microCol = buildColumn( 'micro' );
	const hybridCol = buildColumn( 'hybrid' );
	rig.add( monoCol.group, microCol.group, hybridCol.group );

	const links = [ ...monoCol.links, ...microCol.links, ...hybridCol.links ];

	const findServer = ( col, role ) => col.serverNodes.find( ( n ) => n.userData.role === role );
	const microFileServer = findServer( microCol, 'File Server' );
	const hybridInKernel = hybridCol.serverNodes.filter( ( n ) => n.userData.role === 'UNIX Server' || n.userData.role === 'File Server' );

	let crashing = false;

	async function triggerCrash( setNote ) {

		if ( crashing ) return;
		crashing = true;

		const crashColor = new THREE.Color( THEME.danger );

		// 1. Monolithic: a fault anywhere in the fused kernel takes it all down.
		setNote( 'Monolithic: a bug in the filesystem driver runs in kernel space — it takes the whole kernel down with it.' );
		const monoOriginal = monoCol.layerMeshes.map( ( m ) => m.material.emissive.clone() );
		await tweenAsync( 0.9, ( t ) => {

			monoCol.layerMeshes.forEach( ( m, i ) => {

				const flash = 0.5 + 0.5 * Math.sin( t * Math.PI * 6 );
				m.material.emissive.lerpColors( monoOriginal[ i ], crashColor, Math.min( 1, t * 1.4 ) * ( 0.6 + 0.4 * flash ) );
				m.material.emissiveIntensity = ( 0.3 + flash * 0.6 ) * EMISSIVE;

			} );

		} );
		tween( 0.6, ( t ) => { monoCol.group.position.y = -t * 0.35; } );
		await wait( 700 );

		// 2. Hybrid: the file & UNIX servers live in kernel mode here too, so the
		// same bug still brings the whole kernel down with them.
		setNote( 'Hybrid: the file server also runs in kernel mode here — the same bug still crashes the whole kernel.' );
		const hybridOriginals = hybridInKernel.map( ( n ) => {

			const mesh = n.children.find( ( c ) => c.material && c.material.emissive );
			return mesh ? mesh.material.emissive.clone() : null;

		} );
		await tweenAsync( 0.9, ( t ) => {

			const flash = 0.5 + 0.5 * Math.sin( t * Math.PI * 6 );
			hybridInKernel.forEach( ( n, i ) => {

				n.traverse( ( child ) => {

					if ( child.material && child.material.emissive && hybridOriginals[ i ] ) {

						child.material.emissive.lerpColors( hybridOriginals[ i ], crashColor, Math.min( 1, t * 1.4 ) * ( 0.6 + 0.4 * flash ) );

					}

				} );

			} );

		} );
		tween( 0.6, ( t ) => { hybridCol.group.position.y = -t * 0.35; } );
		await wait( 700 );

		// 3. Microkernel: only the ext2fs translator dies; everything else,
		// including the kernel itself, keeps running.
		setNote( 'Microkernel: the Hurd’s ext2fs translator crashes alone — auth, proc and networking keep running.' );
		if ( microFileServer ) {

			// 3a. The old instance dies outright — flashes red and collapses to
			// nothing, instead of just dimming — to read as "gone", not "hurt".
			await tweenAsync( 0.5, ( t ) => {

				microFileServer.traverse( ( child ) => {

					if ( child.material && child.material.emissive ) {

						child.material.emissive.lerpColors( new THREE.Color( CATEGORIES.filesystem.color ), crashColor, Math.min( 1, t * 1.6 ) );

					}

				} );
				microFileServer.scale.setScalar( 0.72 * ( 1 - t ) );

			} );
			setNote( 'ext2fs is gone. exec spawns a fresh instance — nothing else in the system needs to know or care.' );
			await wait( 650 );

			// 3b. A brand-new instance pops in from nothing at the same spot —
			// a real spawn, not the old one healing.
			microFileServer.traverse( ( child ) => {

				if ( child.material && child.material.emissive ) child.material.emissive.set( new THREE.Color( CATEGORIES.filesystem.color ) );

			} );
			await tweenAsync( 0.5, ( t ) => {

				microFileServer.scale.setScalar( 0.72 * t );

			}, { easing: Easing.backOut } );
			setNote( 'A new ext2fs is running with a fresh PID. The rest of the system never noticed.' );

		}

		// Recover monolithic + hybrid together.
		await Promise.all( [
			tweenAsync( 0.8, ( t ) => {

				monoCol.layerMeshes.forEach( ( m, i ) => {

					m.material.emissive.lerpColors( crashColor, monoOriginal[ i ], t );
					m.material.emissiveIntensity = 0.32 * EMISSIVE;

				} );
				monoCol.group.position.y = -0.35 + t * 0.35;

			} ),
			tweenAsync( 0.8, ( t ) => {

				hybridInKernel.forEach( ( n, i ) => {

					n.traverse( ( child ) => {

						if ( child.material && child.material.emissive && hybridOriginals[ i ] ) {

							child.material.emissive.lerpColors( crashColor, hybridOriginals[ i ], t );

						}

					} );

				} );
				hybridCol.group.position.y = -0.35 + t * 0.35;

			} ),
		] );

		crashing = false;

	}

	let elapsed = 0;

	return {
		scene,
		interactables: [ microCol.baseNode, ...microCol.serverNodes ],
		triggerCrash,
		defaultView: {
			position: new THREE.Vector3( -0.8, 3.0, 27.5 ),
			target: new THREE.Vector3( -0.8, 0.5, 0 ),
		},
		update( dt ) {

			elapsed += dt;
			animateComponent( microCol.baseNode, dt, elapsed, { active: true } );
			animateComponent( hybridCol.baseNode, dt, elapsed, { active: true } );
			[ monoCol, microCol, hybridCol ].forEach( ( col ) => {

				for ( const node of col.serverNodes || [] ) animateComponent( node, dt, elapsed );
				if ( col.appNode.userData.spin ) col.appNode.rotation.y += dt * col.appNode.userData.spin;

			} );
			for ( const link of links ) link.update( dt );

		},
	};

}
