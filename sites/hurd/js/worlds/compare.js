import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { getComponent, CATEGORIES } from '../data/components.js';
import { createComponentObject, pulseHeart } from '../components3d.js';
import { addStandardLighting, createStarfield } from '../utils/sceneKit.js';
import { IPCLink } from '../utils/ipcLink.js';
import { tween, Easing } from '../utils/tween.js';

const MICRO_SATELLITES = [ 'auth', 'proc', 'ext2fs', 'pfinet', 'term' ];
const MONO_LAYERS = [
	{ label: 'process mgmt', color: 0xff5da2 },
	{ label: 'filesystems', color: 0xffb84d },
	{ label: 'networking', color: 0x4dc3ff },
	{ label: 'device drivers', color: 0x9aa0b8 },
];

const LEFT_X = -2.4;
const RIGHT_X = 2.6;

function buildMonolith() {

	const group = new THREE.Group();
	const h = 0.42;
	const layerMeshes = [];

	MONO_LAYERS.forEach( ( layer, i ) => {

		const mat = new THREE.MeshStandardMaterial( {
			color: 0x14141c, emissive: layer.color, emissiveIntensity: 0.32, metalness: 0.6, roughness: 0.35,
		} );
		const mesh = new THREE.Mesh( new THREE.BoxGeometry( 1.9, h, 1.9 ), mat );
		mesh.position.y = -0.7 + i * h;
		group.add( mesh );
		layerMeshes.push( mesh );

	} );

	const outline = new THREE.LineSegments(
		new THREE.EdgesGeometry( new THREE.BoxGeometry( 1.92, h * 4, 1.92 ) ),
		new THREE.LineBasicMaterial( { color: 0xffffff, transparent: true, opacity: 0.35 } ),
	);
	group.add( outline );

	group.position.x = LEFT_X;
	return { group, layerMeshes };

}

export function buildCompareWorld() {

	const scene = new THREE.Scene();
	addStandardLighting( scene, 0xff5da2 );
	scene.add( createStarfield() );

	const rig = new THREE.Group();
	scene.add( rig );

	const { group: monoGroup, layerMeshes } = buildMonolith();
	rig.add( monoGroup );

	const microGroup = new THREE.Group();
	microGroup.position.x = RIGHT_X;
	rig.add( microGroup );

	const machObj = createComponentObject( getComponent( 'gnu-mach' ) );
	machObj.scale.setScalar( 0.75 );
	microGroup.add( machObj );

	const satellites = [];
	const links = [];
	MICRO_SATELLITES.forEach( ( id, i ) => {

		const comp = getComponent( id );
		const obj = createComponentObject( comp );
		obj.scale.setScalar( 0.75 );
		const angle = ( i / MICRO_SATELLITES.length ) * Math.PI * 2;
		const radius = 1.7;
		obj.position.set( Math.cos( angle ) * radius, ( i % 2 === 0 ? 0.2 : -0.2 ), Math.sin( angle ) * radius );
		microGroup.add( obj );
		satellites.push( obj );

		const label = document.createElement( 'div' );
		label.className = 'label2d';
		label.textContent = comp.name;
		const labelObj = new CSS2DObject( label );
		labelObj.position.set( 0, 0.55, 0 );
		obj.add( labelObj );

		links.push( new IPCLink( microGroup, new THREE.Vector3( 0, 0, 0 ), obj.position.clone(), CATEGORIES[ comp.category ].color, {
			particleCount: 2, speed: 0.3, radius: 0.014,
		} ) );

	} );

	const monoLabel = document.createElement( 'div' );
	monoLabel.className = 'label2d';
	monoLabel.textContent = 'one privileged kernel binary';
	const monoLabelObj = new CSS2DObject( monoLabel );
	monoLabelObj.position.set( 0, 1.15, 0 );
	monoGroup.add( monoLabelObj );

	let elapsed = 0;
	let crashing = false;

	function triggerCrash( setNote ) {

		if ( crashing ) return;
		crashing = true;

		setNote( 'Monolithic: a bug in the filesystem driver runs in kernel space — it takes the whole kernel down with it.' );

		const crashColor = new THREE.Color( 0xff2d4c );
		const original = layerMeshes.map( ( m ) => m.material.emissive.clone() );
		tween( 0.9, ( t ) => {

			layerMeshes.forEach( ( m, i ) => {

				const flash = 0.5 + 0.5 * Math.sin( t * Math.PI * 6 );
				m.material.emissive.lerpColors( original[ i ], crashColor, Math.min( 1, t * 1.4 ) * ( 0.6 + 0.4 * flash ) );
				m.material.emissiveIntensity = 0.3 + flash * 0.6;

			} );

		}, {
			onComplete() {

				tween( 0.6, ( t ) => monoGroup.position.y = -t * 0.35 );

				setTimeout( () => {

					setNote( 'Microkernel: the Hurd’s ext2fs translator crashes alone — auth, proc and networking keep running, and it can simply be restarted.' );
					const ext2 = satellites.find( ( s ) => s.userData.componentId === 'ext2fs' );

					tween( 0.5, ( t ) => {

						ext2.traverse( ( child ) => {

							if ( child.material && child.material.emissive ) {

								child.material.emissive.lerpColors( new THREE.Color( 0xffb84d ), crashColor, t );

							}

						} );
						ext2.scale.setScalar( 0.75 * ( 1 - t * 0.6 ) );

					}, {
						onComplete() {

							setTimeout( () => {

								tween( 0.6, ( t ) => {

									ext2.traverse( ( child ) => {

										if ( child.material && child.material.emissive ) {

											child.material.emissive.lerpColors( crashColor, new THREE.Color( 0xffb84d ), t );

										}

									} );
									ext2.scale.setScalar( 0.75 * ( 0.4 + t * 0.6 ) );

								}, {
									onComplete() {

										setNote( 'ext2fs restarted. The rest of the system never noticed.' );

									},
								} );

							}, 700 );

						},
					} );

				}, 500 );

				setTimeout( () => {

					tween( 0.8, ( t ) => {

						layerMeshes.forEach( ( m, i ) => {

							m.material.emissive.lerpColors( crashColor, original[ i ], t );
							m.material.emissiveIntensity = 0.32;

						} );
						monoGroup.position.y = -0.35 + t * 0.35;

					}, {
						onComplete() {

							crashing = false;

						},
					} );

				}, 2600 );

			},
		} );

	}

	return {
		scene,
		interactables: [ machObj, ...satellites ],
		triggerCrash,
		defaultView: {
			position: new THREE.Vector3( 0.1, 2.6, 8.4 ),
			target: new THREE.Vector3( 0.1, -0.1, 0 ),
		},
		update( dt ) {

			elapsed += dt;
			microGroup.rotation.y += dt * 0.06;
			for ( const s of satellites ) {

				if ( s.userData.spin ) s.rotation.y += dt * s.userData.spin;

			}
			pulseHeart( machObj, elapsed );
			for ( const link of links ) link.update( dt );

		},
	};

}
