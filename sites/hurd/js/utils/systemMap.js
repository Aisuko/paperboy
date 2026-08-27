import * as THREE from 'three';
import { COMPONENTS, CATEGORIES, getComponent } from '../data/components.js';
import { createComponentObject, setNodeState, animateComponent } from '../components3d.js';
import { createLabel, createShelf, createDeck, THEME } from './sceneKit.js';
import { IPCLink } from './ipcLink.js';

// The canonical Hurd system map, shared by the overview, boot-sequence and
// run-a-command pages so all three describe the same machine in the same
// place. Reusing one spatial layout is the point: once you have learned where
// ext2fs sits, it is still there when you watch it come up at boot and again
// when `ls` sends it a message.
//
//   The kernel sits low and forward, in front of everything it serves, with the
//   privilege boundary as a plane above it; the servers and translators stand
//   on that plane in four rows, one row per family.

export const KERNEL_POS = new THREE.Vector3( 0, -1.6, 1.1 );
export const KERNEL_Y = KERNEL_POS.y;
export const BOUNDARY_Y = -0.75;
export const USER_Y = 0.35;

const ROWS = [
	{ z: -4.8, halfWidth: 4.3, ids: [ 'init', 'proc', 'auth', 'exec', 'crash' ] },
	{ z: -3.0, halfWidth: 4.3, ids: [ 'ext2fs', 'isofs', 'nfs', 'ftpfs', 'unionfs' ] },
	{ z: -1.2, halfWidth: 3.3, ids: [ 'term', 'null', 'fifo', 'symlink' ] },
	{ z: 0.5, halfWidth: 2.7, ids: [ 'pfinet', 'pflocal', 'defpager' ] },
];

export function buildSystemMap( scene, {
	withDeck = true,
	withBoundary = true,
	linkOpacity = 0.14,
	labels = true,
} = {} ) {

	const group = new THREE.Group();
	scene.add( group );

	if ( withDeck ) group.add( createDeck( 48, { y: -2.4, divisions: 96 } ) );

	// ---- kernel ----
	const machComp = getComponent( 'gnu-mach' );
	const mach = createComponentObject( machComp );
	mach.position.copy( KERNEL_POS );
	group.add( mach );

	const nodes = new Map();
	nodes.set( 'gnu-mach', mach );

	if ( labels ) {

		const machLabel = createLabel( 'GNU Mach — microkernel', 'label2d label2d-key' );
		machLabel.position.set( 0, 0.95, 0 );
		mach.add( machLabel );

	}

	// ---- privilege boundary ----
	if ( withBoundary ) {

		const shelf = createShelf( 10.6, 9.4, { y: BOUNDARY_Y, color: THEME.gridAccent, opacity: 0.55 } );
		shelf.position.z = -2.4;
		group.add( shelf );

		if ( labels ) {

			const above = createLabel( 'user mode ↑', 'label2d label2d-dim' );
			above.position.set( 4.9, BOUNDARY_Y + 0.62, -2.4 );
			group.add( above );

			const below = createLabel( 'kernel mode ↓', 'label2d label2d-dim' );
			below.position.set( 4.9, BOUNDARY_Y - 0.16, -2.4 );
			group.add( below );

		}

	}

	// ---- user-space servers and translators ----
	const links = new Map();

	ROWS.forEach( ( row ) => {

		const count = row.ids.length;
		const halfWidth = row.halfWidth;
		row.ids.forEach( ( id, i ) => {

			const comp = COMPONENTS.find( ( c ) => c.id === id );
			if ( ! comp ) return;

			const x = count === 1 ? 0 : -halfWidth + ( i / ( count - 1 ) ) * halfWidth * 2;
			const obj = createComponentObject( comp );
			obj.position.set( x, USER_Y, row.z );
			group.add( obj );
			nodes.set( id, obj );

			if ( labels ) {

				const label = createLabel( comp.name, 'label2d label2d-dim' );
				label.position.set( 0, 0.6, 0 );
				obj.add( label );

			}

			const link = new IPCLink( group, obj.position.clone(), mach.position.clone(), CATEGORIES[ comp.category ].color, {
				particleCount: 1,
				speed: 0.22 + ( i % 3 ) * 0.05,
				radius: 0.011,
				arc: 0.35,
				tubeOpacity: linkOpacity,
			} );
			link.setActive( false );
			links.set( id, link );

		} );

	} );

	let elapsed = 0;

	return {
		group,
		nodes,
		links,

		get( id ) { return nodes.get( id ) || null; },

		positionOf( id ) {

			const n = nodes.get( id );
			return n ? n.position.clone() : new THREE.Vector3();

		},

		interactables: [ ...nodes.values() ],

		// Sets every node/link back to a resting state.
		resetStates( state = 'pending' ) {

			nodes.forEach( ( n ) => setNodeState( n, state ) );
			links.forEach( ( l ) => l.setActive( false ) );

		},

		setState( id, state ) {

			const n = nodes.get( id );
			if ( n ) setNodeState( n, state );

		},

		setLinkActive( id, active ) {

			const l = links.get( id );
			if ( l ) l.setActive( active );

		},

		activeIds: new Set(),

		update( dt, { activeId = null } = {} ) {

			elapsed += dt;
			nodes.forEach( ( node, id ) => {

				animateComponent( node, dt, elapsed, { active: id === activeId || node.userData.state === 'active' } );

			} );
			links.forEach( ( link ) => link.update( dt ) );

		},
	};

}
