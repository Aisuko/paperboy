import * as THREE from 'three';
import { COMPONENTS, CATEGORIES } from '../data/components.js';
import { createComponentObject, setNodeState, animateComponent } from '../components3d.js';
import { addStandardLighting, createDeck, createLabel, createShelf, THEME } from '../utils/sceneKit.js';
import { tween, Easing } from '../utils/tween.js';

// 02 · How many parts does it have. A parts tray: one shelf per category, each
// module laid out on it so the six different silhouettes can be compared side
// by side.

const ROW_ORDER = [ 'kernel', 'core', 'io', 'filesystem', 'network', 'memory' ];
const ROW_SPACING = 1.75;
const ITEM_SPACING = 1.5;

export function buildComponentsWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene );
	scene.add( createDeck( 20, { y: -1.2 } ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = [];
	const entries = [];

	ROW_ORDER.forEach( ( category, rowIndex ) => {

		const items = COMPONENTS.filter( ( c ) => c.category === category );
		const z = ( rowIndex - ( ROW_ORDER.length - 1 ) / 2 ) * ROW_SPACING;
		const rowWidth = ( items.length - 1 ) * ITEM_SPACING;

		const shelf = createShelf( Math.max( rowWidth + 1.6, 2.4 ), 1.5, {
			y: -0.62, color: CATEGORIES[ category ].color, opacity: 0.4,
		} );
		shelf.position.z = z;
		rig.add( shelf );

		const rowLabel = createLabel( CATEGORIES[ category ].label.toUpperCase(), 'label2d label2d-dim' );
		rowLabel.element.style.color = '#' + CATEGORIES[ category ].color.toString( 16 ).padStart( 6, '0' );
		rowLabel.position.set( -rowWidth / 2 - 1.4, -0.35, z );
		rig.add( rowLabel );

		items.forEach( ( comp, i ) => {

			const obj = createComponentObject( comp );
			obj.position.set( -rowWidth / 2 + i * ITEM_SPACING, 0, z );
			setNodeState( obj, 'done' );
			rig.add( obj );
			interactables.push( obj );
			entries.push( { object: obj, category } );

			const label = createLabel( comp.name, 'label2d' );
			label.position.set( 0, 0.62, 0 );
			obj.add( label );

		} );

	} );

	let elapsed = 0;
	let activeCategory = null;

	function setActiveCategory( category ) {

		activeCategory = category;
		entries.forEach( ( { object, category: cat } ) => {

			const show = ! category || cat === category;
			setNodeState( object, show ? ( category ? 'active' : 'done' ) : 'pending' );

			const from = object.scale.x;
			const to = show ? 1 : 0.001;
			tween( 0.35, ( t ) => {

				object.scale.setScalar( THREE.MathUtils.lerp( from, to, t ) );

			}, { easing: Easing.cubicInOut } );

		} );

	}

	return {
		scene,
		interactables,
		categories: ROW_ORDER.map( ( key ) => ( { key, ...CATEGORIES[ key ] } ) ),
		setActiveCategory,
		getActiveCategory: () => activeCategory,
		defaultView: {
			position: new THREE.Vector3( 0.6, 11.4, 17.6 ),
			target: new THREE.Vector3( 0.2, -0.8, 0.4 ),
		},
		update( dt ) {

			elapsed += dt;
			entries.forEach( ( { object } ) => animateComponent( object, dt, elapsed ) );

		},
	};

}
