import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CATEGORIES } from './data/components.js';

// One distinct silhouette per kind of Hurd component.
//
// The earlier version gave every module the same halo ring and broadly the
// same round/pointy blob, so a filesystem translator and the microkernel read
// as the same object at a glance. These builders instead give each category a
// shape that says what the thing *is*: the kernel is a port-studded core, a
// bootstrap server is a blade in a rack, a filesystem translator is a platter
// stack, a network translator is a dish, the pager is a memory board, and a
// small I/O translator is an inline coupler you could screw into a pipe.
//
// Every module also carries a status LED (drives pending/active/done) and an
// IPC port pad on its -Z face, so links visibly plug into something.

const SHELL_COLOR = 0x141a1e;

function shellMaterial( color, { metalness = 0.55, roughness = 0.42 } = {} ) {

	return new THREE.MeshStandardMaterial( {
		color: SHELL_COLOR,
		emissive: color,
		emissiveIntensity: 0.22,
		metalness,
		roughness,
	} );

}

function glowMaterial( color, opacity = 1 ) {

	return new THREE.MeshBasicMaterial( { color, transparent: true, opacity: opacity * 0.8 } );

}

function addEdges( group, geometry, color, opacity = 0.4 ) {

	const edges = new THREE.EdgesGeometry( geometry );
	const line = new THREE.LineSegments( edges, new THREE.LineBasicMaterial( { color, transparent: true, opacity } ) );
	line.userData.isEdge = true;
	group.add( line );
	return line;

}

// A small emissive pad every link visually terminates on.
function addPort( group, color, position ) {

	const pad = new THREE.Mesh( new THREE.BoxGeometry( 0.09, 0.09, 0.03 ), glowMaterial( color, 0.85 ) );
	pad.position.copy( position );
	pad.userData.isPort = true;
	group.add( pad );
	return pad;

}

// Status LED — recoloured by setNodeState, not by the generic emissive sweep.
function addStatusLed( group, position ) {

	const led = new THREE.Mesh( new THREE.SphereGeometry( 0.045, 10, 10 ), glowMaterial( 0x38424a ) );
	led.position.copy( position );
	led.userData.isStatusLed = true;
	group.add( led );
	return led;

}

/* -------------------------------------------------- kernel: GNU Mach core */
// A hexagonal port hub: a flat hex platform with an inner lattice cage and
// eight IPC posts around the rim. This is the only module with a ring, which
// is what makes it read as "the thing everything else plugs into".
function buildCore( color ) {

	const group = new THREE.Group();

	const baseGeo = new THREE.CylinderGeometry( 0.56, 0.64, 0.13, 6 );
	const base = new THREE.Mesh( baseGeo, shellMaterial( color, { metalness: 0.7, roughness: 0.3 } ) );
	base.position.y = -0.3;
	group.add( base );
	addEdges( group, baseGeo, color, 0.5 ).position.y = -0.3;

	const cageGeo = new THREE.IcosahedronGeometry( 0.34, 1 );
	const cage = new THREE.Mesh( cageGeo, new THREE.MeshBasicMaterial( { color, wireframe: true, transparent: true, opacity: 0.55 } ) );
	group.add( cage );
	group.userData.cage = cage;

	const heart = new THREE.Mesh( new THREE.OctahedronGeometry( 0.16, 0 ), glowMaterial( color, 0.9 ) );
	group.add( heart );
	group.userData.heart = heart;

	// Eight IPC posts — one per port a server can bind to.
	for ( let i = 0; i < 8; i ++ ) {

		const angle = ( i / 8 ) * Math.PI * 2;
		const post = new THREE.Mesh( new THREE.BoxGeometry( 0.06, 0.2, 0.06 ), shellMaterial( color ) );
		post.position.set( Math.cos( angle ) * 0.5, -0.12, Math.sin( angle ) * 0.5 );
		group.add( post );

		const tip = new THREE.Mesh( new THREE.BoxGeometry( 0.08, 0.045, 0.08 ), glowMaterial( color, 0.9 ) );
		tip.position.set( post.position.x, -0.005, post.position.z );
		tip.userData.isPort = true;
		group.add( tip );

	}

	const light = new THREE.PointLight( color, 1.4, 4 );
	group.add( light );

	group.userData.spin = 0.18;
	return group;

}

/* ---------------------------------- core servers: a blade in a server rack */
// auth / proc / exec / init / crash — upright cabinets with slotted faces.
function buildServer( color ) {

	const group = new THREE.Group();

	const bodyGeo = new RoundedBoxGeometry( 0.5, 0.78, 0.34, 2, 0.025 );
	group.add( new THREE.Mesh( bodyGeo, shellMaterial( color ) ) );
	addEdges( group, bodyGeo, color, 0.45 );

	// Slot bars across the front face.
	for ( let i = 0; i < 4; i ++ ) {

		const slot = new THREE.Mesh( new THREE.BoxGeometry( 0.36, 0.035, 0.02 ), glowMaterial( color, 0.5 + i * 0.1 ) );
		slot.position.set( 0, 0.26 - i * 0.16, 0.175 );
		group.add( slot );

	}

	// Handle rail down the side, so the silhouette is asymmetric.
	const rail = new THREE.Mesh( new THREE.BoxGeometry( 0.045, 0.62, 0.045 ), shellMaterial( color, { metalness: 0.8 } ) );
	rail.position.set( -0.27, 0, 0 );
	group.add( rail );

	addStatusLed( group, new THREE.Vector3( 0.17, 0.32, 0.19 ) );
	addPort( group, color, new THREE.Vector3( 0, -0.28, -0.18 ) );

	group.userData.spin = 0;
	return group;

}

/* ------------------------------- I/O translators: an inline pipe coupler */
// term / null / fifo / symlink — small things you splice into a stream.
function buildCoupler( color ) {

	const group = new THREE.Group();

	const nutGeo = new THREE.CylinderGeometry( 0.24, 0.24, 0.22, 6 );
	const nut = new THREE.Mesh( nutGeo, shellMaterial( color, { metalness: 0.75, roughness: 0.3 } ) );
	nut.rotation.z = Math.PI / 2;
	group.add( nut );
	const nutEdges = addEdges( group, nutGeo, color, 0.5 );
	nutEdges.rotation.z = Math.PI / 2;

	// Shaft passing straight through — the stream it sits in.
	const shaft = new THREE.Mesh( new THREE.CylinderGeometry( 0.075, 0.075, 0.72, 12 ), shellMaterial( color, { metalness: 0.85 } ) );
	shaft.rotation.z = Math.PI / 2;
	group.add( shaft );

	[ -0.3, 0.3 ].forEach( ( x ) => {

		const collar = new THREE.Mesh( new THREE.TorusGeometry( 0.1, 0.022, 6, 16 ), glowMaterial( color, 0.75 ) );
		collar.position.x = x;
		collar.rotation.y = Math.PI / 2;
		group.add( collar );

	} );

	addStatusLed( group, new THREE.Vector3( 0, 0.2, 0.14 ) );
	addPort( group, color, new THREE.Vector3( 0, -0.2, -0.1 ) );

	group.userData.spin = 0;
	return group;

}

/* ---------------------------- filesystem translators: a disk platter stack */
// ext2fs / isofs / nfs / ftpfs / unionfs — spindle, platters and a head arm.
function buildDisk( color ) {

	const group = new THREE.Group();

	const stack = new THREE.Group();
	for ( let i = 0; i < 3; i ++ ) {

		const platter = new THREE.Mesh(
			new THREE.CylinderGeometry( 0.4, 0.4, 0.035, 32 ),
			new THREE.MeshStandardMaterial( { color: SHELL_COLOR, emissive: color, emissiveIntensity: 0.2, metalness: 0.9, roughness: 0.16 } ),
		);
		platter.position.y = -0.16 + i * 0.16;
		stack.add( platter );

		const rim = new THREE.Mesh( new THREE.TorusGeometry( 0.4, 0.008, 6, 40 ), glowMaterial( color, 0.5 ) );
		rim.rotation.x = Math.PI / 2;
		rim.position.y = platter.position.y;
		stack.add( rim );

	}
	group.add( stack );
	group.userData.platters = stack;

	const spindle = new THREE.Mesh( new THREE.CylinderGeometry( 0.06, 0.06, 0.52, 12 ), shellMaterial( color, { metalness: 0.85 } ) );
	group.add( spindle );

	// Read/write head arm — the asymmetric bit that makes it read as a drive.
	const arm = new THREE.Group();
	const armBody = new THREE.Mesh( new THREE.BoxGeometry( 0.44, 0.03, 0.07 ), shellMaterial( color ) );
	armBody.position.x = 0.24;
	arm.add( armBody );
	const head = new THREE.Mesh( new THREE.BoxGeometry( 0.07, 0.02, 0.09 ), glowMaterial( color, 0.9 ) );
	head.position.x = 0.03;
	arm.add( head );
	arm.position.set( 0.22, 0.1, 0 );
	group.add( arm );
	group.userData.headArm = arm;

	const deck = new THREE.Mesh( new THREE.BoxGeometry( 0.98, 0.04, 0.86 ), shellMaterial( color, { metalness: 0.6, roughness: 0.5 } ) );
	deck.position.y = -0.28;
	group.add( deck );

	addStatusLed( group, new THREE.Vector3( -0.4, -0.24, 0.36 ) );
	addPort( group, color, new THREE.Vector3( 0, -0.28, -0.44 ) );

	group.userData.spin = 0;
	return group;

}

/* -------------------------------- network translators: a parabolic dish */
// pfinet / pflocal — a dish on a mast with a feed horn.
function buildDish( color ) {

	const group = new THREE.Group();

	const profile = [];
	for ( let i = 0; i <= 10; i ++ ) {

		const r = ( i / 10 ) * 0.42;
		profile.push( new THREE.Vector2( r, ( r * r ) * 1.1 ) );

	}
	const dishGeo = new THREE.LatheGeometry( profile, 28 );
	const dish = new THREE.Mesh( dishGeo, new THREE.MeshStandardMaterial( {
		color: SHELL_COLOR, emissive: color, emissiveIntensity: 0.2,
		metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide,
	} ) );
	dish.rotation.x = -Math.PI * 0.28;
	dish.position.y = 0.2;
	group.add( dish );
	group.userData.dish = dish;

	const rimGeo = new THREE.TorusGeometry( 0.42, 0.014, 6, 36 );
	const rim = new THREE.Mesh( rimGeo, glowMaterial( color, 0.7 ) );
	rim.rotation.copy( dish.rotation );
	rim.position.copy( dish.position );
	rim.position.y += 0.19 * Math.cos( dish.rotation.x );
	group.add( rim );

	// Feed horn on a tripod stub, aimed back into the dish.
	const horn = new THREE.Mesh( new THREE.ConeGeometry( 0.06, 0.14, 10 ), glowMaterial( color, 0.9 ) );
	horn.position.set( 0, 0.36, 0.2 );
	horn.rotation.x = Math.PI * 0.72;
	group.add( horn );

	const mast = new THREE.Mesh( new THREE.CylinderGeometry( 0.045, 0.06, 0.5, 10 ), shellMaterial( color, { metalness: 0.8 } ) );
	mast.position.y = -0.2;
	group.add( mast );

	const foot = new THREE.Mesh( new THREE.CylinderGeometry( 0.24, 0.28, 0.05, 16 ), shellMaterial( color, { roughness: 0.6 } ) );
	foot.position.y = -0.45;
	group.add( foot );

	addStatusLed( group, new THREE.Vector3( 0.18, -0.42, 0.16 ) );
	addPort( group, color, new THREE.Vector3( 0, -0.45, -0.18 ) );

	group.userData.spin = 0;
	return group;

}

/* --------------------------------- memory management: a DIMM memory board */
// default pager — a flat board with contact teeth and two packages on it.
function buildBoard( color ) {

	const group = new THREE.Group();

	const boardGeo = new THREE.BoxGeometry( 1.0, 0.36, 0.05 );
	group.add( new THREE.Mesh( boardGeo, shellMaterial( color, { metalness: 0.35, roughness: 0.65 } ) ) );
	addEdges( group, boardGeo, color, 0.45 );

	// Contact teeth along the bottom edge.
	for ( let i = 0; i < 14; i ++ ) {

		const tooth = new THREE.Mesh( new THREE.BoxGeometry( 0.04, 0.06, 0.055 ), glowMaterial( color, 0.55 ) );
		tooth.position.set( -0.45 + i * 0.069, -0.2, 0 );
		group.add( tooth );

	}

	// Two memory packages.
	[ -0.24, 0.24 ].forEach( ( x ) => {

		const chip = new THREE.Mesh( new THREE.BoxGeometry( 0.32, 0.17, 0.045 ), shellMaterial( color, { metalness: 0.5 } ) );
		chip.position.set( x, 0.03, 0.048 );
		group.add( chip );

		const mark = new THREE.Mesh( new THREE.BoxGeometry( 0.2, 0.02, 0.01 ), glowMaterial( color, 0.8 ) );
		mark.position.set( x, 0.03, 0.075 );
		group.add( mark );

	} );

	addStatusLed( group, new THREE.Vector3( 0.45, 0.12, 0.05 ) );
	addPort( group, color, new THREE.Vector3( 0, -0.24, 0 ) );

	group.userData.spin = 0;
	return group;

}

const BUILDERS = {
	core: buildCore,
	server: buildServer,
	module: buildCoupler,
	disk: buildDisk,
	antenna: buildDish,
	crystal: buildBoard,
};

const STATE_COLORS = {
	pending: 0x38424a,
	active: 0x4ec9b0,
	done: 0x6fcf7f,
	failed: 0xe5644e,
};

// Builds the 3D representation of a single Hurd component (see data/components.js).
export function createComponentObject( component, { colorOverride = null } = {} ) {

	const color = colorOverride ?? ( CATEGORIES[ component.category ]?.color ?? 0x4ec9b0 );
	const build = BUILDERS[ component.shape ] || buildCoupler;
	const group = build( color );

	group.userData.componentId = component.id;
	group.userData.category = component.category;
	group.userData.accent = color;
	group.userData.state = 'pending';
	group.traverse( ( obj ) => { obj.userData.componentId = component.id; } );

	setNodeState( group, 'pending' );
	return group;

}

// pending -> dim, active -> lit, done -> settled, failed -> red.
// Every emissive/edge/glow child is driven from one place so the whole exhibit
// has a single, consistent visual vocabulary for "this is running now".
export function setNodeState( group, state ) {

	const s = STATE_COLORS[ state ] ? state : 'pending';
	group.userData.state = s;

	const lit = s === 'active';
	const done = s === 'done';
	const failed = s === 'failed';

	const emissive = failed ? 0.55 : ( lit ? 0.62 : ( done ? 0.3 : 0.12 ) );
	const edgeOpacity = failed ? 0.75 : ( lit ? 0.8 : ( done ? 0.45 : 0.2 ) );
	const glowOpacity = failed ? 0.95 : ( lit ? 1 : ( done ? 0.6 : 0.28 ) );

	group.traverse( ( child ) => {

		const mat = child.material;
		if ( ! mat ) return;

		if ( child.userData.isStatusLed ) {

			mat.color.setHex( STATE_COLORS[ s ] );
			return;

		}

		if ( child.userData.isEdge ) { mat.opacity = edgeOpacity; return; }

		if ( 'emissiveIntensity' in mat ) {

			if ( mat.userData.baseEmissive === undefined ) mat.userData.baseEmissive = mat.emissiveIntensity;
			mat.emissiveIntensity = mat.userData.baseEmissive * ( emissive / 0.22 );

		} else if ( mat.transparent ) {

			if ( mat.userData.baseOpacity === undefined ) mat.userData.baseOpacity = mat.opacity;
			mat.opacity = mat.userData.baseOpacity * glowOpacity;

		}

		if ( failed && mat.color && ! child.userData.isStatusLed ) mat.color.lerp( new THREE.Color( STATE_COLORS.failed ), 0.35 );

	} );

	if ( group.userData.heart ) group.userData.heart.visible = true;

}

// Per-frame idle motion. Only the pieces that would actually move in the real
// thing move here: the kernel's lattice turns, disk platters spin, a dish
// sweeps — everything else stays still, which is what makes the moving parts
// legible.
export function animateComponent( group, dt, t, { active = false } = {} ) {

	const rate = active ? 1.8 : 0.45;

	if ( group.userData.cage ) group.userData.cage.rotation.y += dt * 0.35 * rate;
	if ( group.userData.heart ) group.userData.heart.scale.setScalar( 1 + Math.sin( t * 2.6 ) * ( active ? 0.14 : 0.05 ) );
	if ( group.userData.platters ) group.userData.platters.rotation.y += dt * 1.4 * rate;
	if ( group.userData.headArm ) group.userData.headArm.rotation.y = Math.sin( t * ( active ? 2.2 : 0.6 ) ) * 0.34;
	if ( group.userData.dish ) group.userData.dish.rotation.y = Math.sin( t * ( active ? 0.9 : 0.3 ) ) * 0.4;
	if ( group.userData.spin ) group.rotation.y += dt * group.userData.spin * rate;

}
