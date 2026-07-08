import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { COMPONENTS, CATEGORIES } from '../data/components.js';
import { createComponentObject, pulseHeart } from '../components3d.js';
import { addStandardLighting, createStarfield, createFloor } from '../utils/sceneKit.js';
import { tween, Easing } from '../utils/tween.js';

const ROW_ORDER = [ 'kernel', 'core', 'io', 'filesystem', 'network', 'memory' ];

export function buildComponentsWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0x35d0ba );
	scene.add( createStarfield() );
	scene.add( createFloor( 12 ) );

	const rig = new THREE.Group();
	scene.add( rig );

	const interactables = [];
	const entries = []; // { object, category }
	let machRef = null;

	const rowSpacing = 1.9;
	const itemSpacing = 1.55;
	const totalRows = ROW_ORDER.length;

	ROW_ORDER.forEach( ( category, rowIndex ) => {

		const items = COMPONENTS.filter( ( c ) => c.category === category );
		const z = ( rowIndex - ( totalRows - 1 ) / 2 ) * rowSpacing;
		const rowWidth = ( items.length - 1 ) * itemSpacing;

		const rowLabel = document.createElement( 'div' );
		rowLabel.className = 'label2d';
		rowLabel.style.color = '#' + CATEGORIES[ category ].color.toString( 16 ).padStart( 6, '0' );
		rowLabel.textContent = CATEGORIES[ category ].label.toUpperCase();
		const rowLabelObj = new CSS2DObject( rowLabel );
		rowLabelObj.position.set( -rowWidth / 2 - 1.1, 0.5, z );
		rig.add( rowLabelObj );

		items.forEach( ( comp, i ) => {

			const obj = createComponentObject( comp );
			obj.position.set( -rowWidth / 2 + i * itemSpacing, 0, z );
			rig.add( obj );
			interactables.push( obj );
			entries.push( { object: obj, category } );
			if ( comp.id === 'gnu-mach' ) machRef = obj;

			const label = document.createElement( 'div' );
			label.className = 'label2d';
			label.textContent = comp.name;
			const labelObj = new CSS2DObject( label );
			labelObj.position.set( 0, 0.62, 0 );
			obj.add( labelObj );

		} );

	} );

	let elapsed = 0;
	let activeCategory = null;

	function setActiveCategory( category ) {

		activeCategory = category;
		for ( const { object, category: cat } of entries ) {

			const show = ! category || cat === category;
			const targetScale = show ? 1 : 0.001;
			tween( 0.4, ( t ) => {

				const s = THREE.MathUtils.lerp( object.scale.x, targetScale, t );
				object.scale.setScalar( s );

			}, { easing: Easing.cubicInOut } );

		}

	}

	return {
		scene,
		interactables,
		categories: ROW_ORDER.map( ( key ) => ( { key, ...CATEGORIES[ key ] } ) ),
		setActiveCategory,
		getActiveCategory: () => activeCategory,
		defaultView: {
			position: new THREE.Vector3( 0, 5.4, 8.6 ),
			target: new THREE.Vector3( 0, -0.2, 0 ),
		},
		update( dt ) {

			elapsed += dt;
			for ( const { object } of entries ) {

				if ( object.userData.spin ) object.rotation.y += dt * object.userData.spin * 0.5;

			}

			if ( machRef ) pulseHeart( machRef, elapsed );

		},
	};

}
