import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { createRenderer, createLabelRenderer, createRenderPipeline, buildSceneOutput } from './utils/renderKit.js';
import { ProcessConsole } from './utils/console.js';
import { bindViewport } from './utils/viewport.js';
import { tweenVec3, updateTweens, Easing } from './utils/tween.js';

import { buildTensorWorld, matrixValue } from './worlds/tensor.js';
import { buildFormatsWorld, BLOCK } from './worlds/formats.js';
import { buildTransferWorld } from './worlds/transfer.js';
import { buildIntensityWorld, MM } from './worlds/intensity.js';

import { TENSOR_STEPS, FORMAT_STEPS, TRANSFER_STEPS, INTENSITY_STEPS } from './data/copy.js';
import {
	FORMATS, BY_KEY, LINKS, SHAPES, GIB,
	quantize, quantizeBlock, bytesOf, bitsPerValue, numel, sci, fmtBytes, fmtTime,
} from './data/formats.js';
import {
	OPS, PRECISIONS, ACCELERATORS, MODELS, BY_OP, WEEK, GELU_TERMS, GELU_FLOPS, BYTES_PER_PARAM,
	D_MODEL, D_FF, evaluate, attnShare, eng, fmtFlops, fmtCount, fmtGB,
} from './data/intensity.js';

const viewport = document.getElementById( 'viewport' );
const container = document.getElementById( 'webgl' );

const renderer = createRenderer();
container.appendChild( renderer.domElement );

const labelRenderer = createLabelRenderer();
container.appendChild( labelRenderer.domElement );

const BASE_FOV = 28;
const DESIGN_ASPECT = 16 / 9;
const FRAME_MARGIN = 1.12;

const camera = new THREE.PerspectiveCamera( BASE_FOV, 1, 0.1, 400 );
camera.position.set( -2.0, 3.4, 20 );

const controls = new OrbitControls( camera, renderer.domElement );
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3;
controls.maxDistance = 70;
controls.maxPolarAngle = Math.PI * 0.62;

const renderPipeline = createRenderPipeline( renderer );

// The step views are framed for a wide viewport. On anything narrower the
// horizontal extent gets clipped, so widen the vertical FOV to keep the same
// horizontal coverage — the scene stays centred on controls.target either way.
function frameCamera( w, h ) {

	const aspect = w / h;
	const fit = aspect < DESIGN_ASPECT ? DESIGN_ASPECT / aspect : 1;
	const halfTan = Math.tan( THREE.MathUtils.degToRad( BASE_FOV ) * 0.5 ) * FRAME_MARGIN * fit;
	camera.fov = Math.min( 60, THREE.MathUtils.radToDeg( 2 * Math.atan( halfTan ) ) );
	camera.updateProjectionMatrix();

}

bindViewport( viewport, camera, [ renderer, labelRenderer ], frameCamera );

const worlds = {
	tensor: buildTensorWorld(),
	formats: buildFormatsWorld(),
	transfer: buildTransferWorld(),
	intensity: buildIntensityWorld(),
};

const STEPS = { tensor: TENSOR_STEPS, formats: FORMAT_STEPS, transfer: TRANSFER_STEPS, intensity: INTENSITY_STEPS };

const PLAY_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5v11l10-5.5z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>';

const sceneOutputs = {};
for ( const key in worlds ) sceneOutputs[ key ] = buildSceneOutput( worlds[ key ].scene, camera, { strength: 0.24, radius: 0.6, threshold: 0.6 } );

let currentKey = 'tensor';
renderPipeline.outputNode = sceneOutputs.tensor;

const proc = new ProcessConsole( document.getElementById( 'console' ) );

function flyTo( view, duration = 0.9 ) {

	controls.enabled = false;
	tweenVec3( camera.position, view.position, duration, { easing: Easing.cubicInOut } );
	tweenVec3( controls.target, view.target, duration, {
		easing: Easing.cubicInOut,
		onComplete: () => { controls.enabled = true; },
	} );

}

function setCard( key, index ) {

	const card = document.querySelector( `[data-card="${ key }"]` );
	const step = STEPS[ key ][ index ];
	card.querySelector( '[data-role="kicker"]' ).textContent = step.kicker;
	card.querySelector( '[data-role="num"]' ).textContent = index + 1;
	card.querySelector( '[data-role="total"]' ).textContent = STEPS[ key ].length;
	card.querySelector( '[data-role="title"]' ).textContent = step.title;
	card.querySelector( '[data-role="desc"]' ).textContent = step.desc;
	card.querySelector( '[data-role="formula"]' ).textContent = step.formula;

}

function makeScrubber( key, count, onStep ) {

	const root = document.querySelector( `.scrubber[data-scrub="${ key }"]` );
	const track = root.querySelector( '.scrubber-track' );
	const nodes = [];
	let index = 0;
	let timer = null;

	function paint() {

		nodes.forEach( ( n, i ) => {

			n.classList.toggle( 'active', i === index );
			n.classList.toggle( 'done', i < index );

		} );

	}

	function stop() {

		if ( timer ) { clearInterval( timer ); timer = null; }
		root.querySelector( '[data-act="play"]' ).innerHTML = PLAY_ICON;

	}

	function go( i ) {

		index = Math.max( 0, Math.min( count - 1, i ) );
		paint();
		onStep( index );

	}

	for ( let i = 0; i < count; i ++ ) {

		const node = document.createElement( 'div' );
		node.className = 'scrubber-node';
		node.addEventListener( 'click', () => { stop(); go( i ); } );
		track.appendChild( node );
		nodes.push( node );

	}

	root.querySelector( '[data-act="prev"]' ).addEventListener( 'click', () => { stop(); go( index - 1 ); } );
	root.querySelector( '[data-act="next"]' ).addEventListener( 'click', () => { stop(); go( index + 1 ); } );
	root.querySelector( '[data-act="play"]' ).addEventListener( 'click', ( e ) => {

		if ( timer ) { stop(); return; }
		e.currentTarget.innerHTML = PAUSE_ICON;
		if ( index >= count - 1 ) go( 0 );
		timer = setInterval( () => {

			if ( index >= count - 1 ) { stop(); return; }
			go( index + 1 );

		}, 3600 );

	} );

	paint();
	return { go, stop, get index() { return index; } };

}

function chipRow( root, items, onPick, activeKey ) {

	root.innerHTML = '';
	items.forEach( ( item ) => {

		const b = document.createElement( 'button' );
		b.className = 'chip' + ( item.key === activeKey ? ' active' : '' );
		b.textContent = item.label;
		b.dataset.key = item.key;
		b.addEventListener( 'click', () => {

			[ ...root.children ].forEach( ( c ) => c.classList.toggle( 'active', c === b ) );
			onPick( item );

		} );
		root.appendChild( b );

	} );

}

const REF = SHAPES[ 0 ];
const REF_N = numel( REF.dims );

let tensorIndex = 29;

const idxSlider = document.getElementById( 'idx-slider' );
const idxReadout = document.getElementById( 'idx-readout' );

idxSlider.addEventListener( 'input', () => {

	tensorIndex = parseInt( idxSlider.value, 10 );
	const p = worlds.tensor.setPicked( tensorIndex );
	idxReadout.textContent = `[${ p.r }, ${ p.c }]`;
	renderTensorTable();

} );

idxSlider.addEventListener( 'change', () => {

	const r = Math.floor( tensorIndex / 8 );
	const c = tensorIndex % 8;
	proc.write( `offset(${ r }, ${ c }) = ${ r } · 8 + ${ c } = ${ tensorIndex }   byte ${ tensorIndex * 4 }   value ${ matrixValue( r, c ).toFixed( 4 ) }`, 'calc' );

} );

const tensorScrub = makeScrubber( 'tensor', TENSOR_STEPS.length, ( i ) => {

	worlds.tensor.setStep( i );
	setCard( 'tensor', i );
	tensorTrace( i );
	flyTo( worlds.tensor.getStepView( i ) );
	renderTensorTable();

} );

function renderTensorTable() {

	const t = worlds.tensor.getState();
	const rows = t.order === 'col'
		? [ [ 'shape', '(8, 6)' ], [ 'stride', '(1, 8)' ], [ 'contiguous', 'no' ] ]
		: [ [ 'shape', '(6, 8)' ], [ 'stride', '(8, 1)' ], [ 'contiguous', 'yes' ] ];
	document.getElementById( 'tensor-table' ).innerHTML = `
		<tbody>
			${ rows.map( ( [ a, b ] ) => `<tr><td>${ a }</td><td class="num">${ b }</td></tr>` ).join( '' ) }
			<tr><td>numel</td><td class="num">48</td></tr>
			<tr><td>dtype</td><td class="num">float32 · 4 B</td></tr>
			<tr><td>bytes</td><td class="num">192</td></tr>
			<tr class="is-pick"><td class="tag">picked</td><td class="num">offset ${ t.picked }</td></tr>
		</tbody>`;

}

function tensorHeader() {

	proc.clear();
	proc.setTitle( 'tensor — shape, stride, storage' );
	proc.setStatus( 'computed', 'done' );
	proc.write( 'x = torch.randn(6, 8)', 'cmd' );
	proc.write( 'x.shape        (6, 8)', 'out' );
	proc.write( 'x.stride()     (8, 1)', 'out' );
	proc.write( 'x.storage()    48 contiguous float32', 'dim' );
	proc.rule();

}

function tensorTrace( i ) {

	proc.write( `${ i + 1 }. ${ TENSOR_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		proc.write( 'rank 0   ()          1 element', 'out' );
		proc.write( 'rank 1   (8,)        8', 'out' );
		proc.write( 'rank 2   (6, 8)      48', 'out' );
		proc.write( 'rank 3   (3, 6, 8)   144', 'out' );
		proc.write( 'the dtype and the device are separate from the shape — a tensor carries four things', 'note' );

	} else if ( i === 1 ) {

		proc.write( 'numel = Π shape', 'cmd' );
		proc.write( '3 · 6 · 8 = 144 elements', 'calc' );
		proc.write( 'a 175B-parameter model is this identity summed over a few thousand tensors', 'dim' );

	} else if ( i === 2 ) {

		proc.write( 'row-major: the last axis is the fastest', 'out' );
		proc.write( '[0,0] → 0    [0,7] → 7    [1,0] → 8    [5,7] → 47', 'calc' );
		proc.write( 'x.is_contiguous() → True', 'ok' );

	} else if ( i === 3 ) {

		const r = Math.floor( tensorIndex / 8 );
		const c = tensorIndex % 8;
		proc.write( 'offset = Σ i[k] · stride[k]', 'cmd' );
		proc.write( `offset(${ r }, ${ c }) = ${ r } · 8 + ${ c } · 1 = ${ tensorIndex }`, 'calc' );
		proc.write( `byte address = ${ tensorIndex } · 4 = ${ tensorIndex * 4 }`, 'out' );
		proc.write( 'strides are stored in elements, not bytes — the dtype supplies the rest', 'dim' );

	} else if ( i === 4 ) {

		proc.write( 'y = x.T', 'cmd' );
		proc.write( 'y.shape        (8, 6)', 'out' );
		proc.write( 'y.stride()     (1, 8)', 'out' );
		proc.write( 'y.data_ptr() == x.data_ptr() → True   no bytes copied', 'ok' );
		proc.write( 'y.is_contiguous() → False', 'warn' );
		proc.write( 'y.contiguous() walks the tape out of order and writes a second 192-byte buffer', 'note' );

	} else {

		proc.write( 'bytes = numel × itemsize', 'cmd' );
		proc.write( '48 × 4 = 192 bytes here', 'out' );
		proc.write( `${ REF.dims[ 0 ].toLocaleString( 'en-AU' ) } × ${ REF.dims[ 1 ].toLocaleString( 'en-AU' ) } = ${ REF_N.toLocaleString( 'en-AU' ) } elements`, 'calc' );
		FORMATS.forEach( ( f ) => proc.write( `${ f.short.padEnd( 5 ) } ${ ( bytesOf( REF_N, f ) / GIB ).toFixed( 3 ) } GiB`, f.key === 'fp32' ? 'out' : 'dim' ) );
		proc.write( 'page 02 is about the second number', 'note' );

	}

}

let value = 3.14159;
let shapeIndex = 0;

const valSlider = document.getElementById( 'val-slider' );
const valReadout = document.getElementById( 'val-readout' );

const toValue = ( t ) => 10 ** ( -9 + 18 * t );
const toSlider = ( v ) => ( Math.log10( Math.abs( v ) ) + 9 ) / 18;

const VALUE_CHIPS = [
	{ key: 'pi', label: 'π', v: 3.14159 },
	{ key: 'one', label: '1.0', v: 1 },
	{ key: 'small', label: '6.0e−5', v: 6e-5 },
	{ key: 'big', label: '65,505', v: 65505 },
	{ key: 'e4', label: '448', v: 448 },
	{ key: 'tiny', label: '1e−8', v: 1e-8 },
	{ key: 'neg', label: '−2.5', v: -2.5 },
];

function applyValue( v, fromSlider = false ) {

	value = v;
	if ( ! fromSlider && v > 0 ) valSlider.value = String( Math.min( 1, Math.max( 0, toSlider( v ) ) ) );
	valReadout.textContent = sci( v );
	worlds.formats.setValue( v );
	renderFmtTable();

}

valSlider.addEventListener( 'input', () => applyValue( Number( toValue( parseFloat( valSlider.value ) ).toPrecision( 6 ) ), true ) );
valSlider.addEventListener( 'change', () => logValue() );

chipRow( document.getElementById( 'val-chips' ), VALUE_CHIPS, ( item ) => { applyValue( item.v ); logValue(); }, 'pi' );
chipRow( document.getElementById( 'shape-chips' ), SHAPES.map( ( s, i ) => ( { key: s.key, label: s.label, i } ) ), ( item ) => {

	shapeIndex = item.i;
	worlds.formats.setShape( item.i );
	renderFmtTable();
	const n = numel( SHAPES[ item.i ].dims );
	proc.write( `${ SHAPES[ item.i ].label } · ${ n.toLocaleString( 'en-AU' ) } elements · fp32 ${ ( bytesOf( n, BY_KEY.fp32 ) / GIB ).toFixed( 3 ) } GiB → nvfp4 ${ ( bytesOf( n, BY_KEY.nvfp4 ) / GIB ).toFixed( 3 ) } GiB`, 'calc' );

}, SHAPES[ 0 ].key );

function logValue() {

	const q = quantize( value, BY_KEY.fp16 );
	const q4 = quantize( value, BY_KEY.e4m3 );
	proc.write( `x = ${ sci( value ) }   fp16 → ${ q.flag === 'ok' || q.flag === 'subnormal' ? sci( q.value ) : q.flag }   e4m3 → ${ q4.flag === 'ok' || q4.flag === 'subnormal' ? sci( q4.value ) : q4.flag }`, 'calc' );

}

function renderFmtTable() {

	const n = numel( SHAPES[ shapeIndex ].dims );
	document.getElementById( 'fmt-table' ).innerHTML = `
		<thead><tr><th>format</th><th>rounds to</th><th>size</th></tr></thead>
		<tbody>${ FORMATS.map( ( f ) => {

			const q = quantize( value, f );
			const bad = q.flag === 'overflow' || q.flag === 'underflow';
			const shown = q.flag === 'overflow' ? 'overflow' : q.flag === 'underflow' ? '→ 0' : sci( q.value );
			return `<tr class="${ bad ? 'is-warn' : '' }"><td class="tag">${ f.short }</td><td class="num">${ shown }</td><td class="num">${ ( bytesOf( n, f ) / GIB ).toFixed( 3 ) } GiB</td></tr>`;

		} ).join( '' ) }</tbody>`;

	document.getElementById( 'fmt-summary' ).textContent =
		`${ SHAPES[ shapeIndex ].label } · ${ n.toLocaleString( 'en-AU' ) } elements · fp32 ${ fmtBytes( bytesOf( n, BY_KEY.fp32 ) ) } → nvfp4 ${ fmtBytes( bytesOf( n, BY_KEY.nvfp4 ) ) }`;

}

const fmtScrub = makeScrubber( 'formats', FORMAT_STEPS.length, ( i ) => {

	worlds.formats.setStep( i );
	setCard( 'formats', i );
	fmtTrace( i );
	flyTo( worlds.formats.getStepView( i ) );

} );

function fmtHeader() {

	proc.clear();
	proc.setTitle( 'dtype — bits, range, precision' );
	proc.setStatus( 'computed', 'done' );
	proc.write( `x = ${ sci( value ) }`, 'cmd' );
	proc.write( 'each row below is the same x, encoded with the bits that format has', 'dim' );
	proc.rule();

}

function fmtTrace( i ) {

	const f = [ null, BY_KEY.fp32, BY_KEY.fp16, BY_KEY.bf16, BY_KEY.e4m3, BY_KEY.nvfp4 ][ i ];
	proc.write( `${ i + 1 }. ${ FORMAT_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		const q = quantize( value, BY_KEY.fp32 );
		proc.write( 'x = (−1)^s · 2^(E − bias) · 1.f', 'cmd' );
		proc.write( `s = ${ q.sign }   E = ${ q.expField } − 127 = ${ q.expField - 127 }   f = ${ q.mantField } / 2^23`, 'calc' );
		proc.write( `→ ${ q.sign ? '−' : '' }2^${ q.expField - 127 } · ${ ( 1 + q.mantField / 2 ** 23 ).toFixed( 7 ) } = ${ sci( q.value ) }`, 'out' );

	} else if ( i === 6 ) {

		const n = numel( SHAPES[ shapeIndex ].dims );
		proc.write( `${ SHAPES[ shapeIndex ].label } · ${ SHAPES[ shapeIndex ].dims.join( ' × ' ) } = ${ n.toLocaleString( 'en-AU' ) } elements`, 'cmd' );
		FORMATS.forEach( ( g ) => proc.write( `${ g.short.padEnd( 5 ) } ${ String( bitsPerValue( g ) ).padStart( 4 ) } bits   ${ ( bytesOf( n, g ) / GIB ).toFixed( 3 ) } GiB   ${ ( bytesOf( n, BY_KEY.fp32 ) / bytesOf( n, g ) ).toFixed( 2 ) }× smaller`, g.key === 'nvfp4' ? 'ok' : 'out' ) );
		proc.write( 'weights are read once per token — bytes here become milliseconds on page 03', 'note' );

	} else if ( i === 7 ) {

		FORMATS.forEach( ( g ) => proc.write( `${ g.short.padEnd( 5 ) } range ${ ( Math.log10( g.max ) - Math.log10( g.minNormal ) ).toFixed( 1 ) } decades   step at 1.0 ${ sci( g.eps ) }   ${ g.digits.toFixed( 1 ) } digits`, 'out' ) );
		proc.write( 'range first, precision second, hardware support third', 'note' );
		proc.write( 'bf16 to train · fp8 to train large and to serve · nvfp4 for weights at inference', 'calc' );

	} else if ( i === 5 ) {

		const b = quantizeBlock( BLOCK, BY_KEY.nvfp4 );
		proc.write( 'E2M1 codes: ±{0, 0.5, 1, 1.5, 2, 3, 4, 6}', 'out' );
		proc.write( `block amax ${ b.amax }   scale = round_e4m3(${ b.amax } / 6) = ${ b.scale }`, 'calc' );
		proc.write( `stored  ${ b.cells.slice( 0, 8 ).map( ( c ) => c.value ).join( ' ' ) } …`, 'out' );
		proc.write( `decoded ${ b.cells.slice( 0, 8 ).map( ( c ) => ( c.value * b.scale ).toFixed( 2 ) ).join( ' ' ) } …`, 'out' );
		proc.write( `true    ${ BLOCK.slice( 0, 8 ).map( ( v ) => v.toFixed( 2 ) ).join( ' ' ) } …`, 'dim' );
		proc.write( '(16 × 4 + 8) / 16 = 4.5 bits per value · mxfp4 uses 32-value blocks and an E8M0 scale → 4.25', 'ok' );

	} else {

		const q = quantize( value, f );
		proc.write( `${ f.name }   1 + ${ f.e } + ${ f.m } bits`, 'cmd' );
		proc.write( `range    ${ sci( f.minNormal ) } … ${ sci( f.max ) }   (subnormals to ${ sci( f.minSub ) })`, 'out' );
		proc.write( `step at 1.0   ${ sci( f.eps ) }   ≈ ${ f.digits.toFixed( 1 ) } decimal digits`, 'out' );
		proc.write( `${ sci( value ) } → ${ q.flag === 'overflow' ? 'overflow, saturates to ' + sci( f.max ) : q.flag === 'underflow' ? 'underflows to 0' : sci( q.value ) + '   error ' + ( q.error * 100 ).toFixed( 3 ) + '%' }`, q.flag === 'ok' || q.flag === 'subnormal' ? 'calc' : 'warn' );

		if ( i === 2 ) proc.write( 'fp16 training needs loss scaling and a fp32 master copy for exactly this reason', 'note' );
		if ( i === 3 ) proc.write( 'fp32 → bf16 is a truncation of the low 16 bits; fp32 → fp16 is a real conversion that can overflow', 'note' );
		if ( i === 4 ) {

			const q5 = quantize( value, BY_KEY.e5m2 );
			proc.write( `e5m2  range ${ sci( BY_KEY.e5m2.minNormal ) } … ${ sci( BY_KEY.e5m2.max ) }   → ${ q5.flag === 'overflow' ? 'overflow' : q5.flag === 'underflow' ? '0' : sci( q5.value ) }`, 'out' );
			proc.write( 'weights and activations in e4m3, gradients in e5m2, both under a per-tensor scale', 'note' );

		}

	}

}

let dtypeKey = 'fp32';
let linkKey = 'pcie5';
let pinnedOn = true;
let xferShape = 0;

const pinChip = document.getElementById( 'pin-chip' );
const shapeChip = document.getElementById( 'shape-chip' );

chipRow( document.getElementById( 'dtype-chips' ), FORMATS.map( ( f ) => ( { key: f.key, label: f.short } ) ), ( item ) => {

	dtypeKey = item.key;
	worlds.transfer.setFormat( item.key );
	renderXferTable();
	logCopy( 'dtype' );

}, 'fp32' );

chipRow( document.getElementById( 'link-chips' ), LINKS.map( ( l ) => ( { key: l.key, label: l.key === 'hbm' ? 'HBM3e' : l.name.replace( ' x16', '' ) } ) ), ( item ) => {

	linkKey = item.key;
	worlds.transfer.setLink( item.key );
	renderXferTable();
	logCopy( 'link' );

}, 'pcie5' );

pinChip.addEventListener( 'click', () => {

	pinnedOn = ! pinnedOn;
	pinChip.classList.toggle( 'active', pinnedOn );
	pinChip.textContent = pinnedOn ? 'pinned' : 'pageable';
	worlds.transfer.setPinned( pinnedOn );
	renderXferTable();
	proc.write( pinnedOn ? 'buffer.pin_memory() → DMA reads host memory directly' : 'pageable buffer → driver stages it through an internal pinned copy first', pinnedOn ? 'ok' : 'warn' );

} );

shapeChip.textContent = SHAPES[ 0 ].label;
shapeChip.addEventListener( 'click', () => {

	xferShape = ( xferShape + 1 ) % SHAPES.length;
	shapeChip.textContent = SHAPES[ xferShape ].label;
	worlds.transfer.setShape( xferShape );
	renderXferTable();
	logCopy( 'tensor' );

} );

document.getElementById( 'copy-btn' ).addEventListener( 'click', () => {

	const m = worlds.transfer.fire();
	const s = worlds.transfer.getState();
	proc.write( `cudaMemcpyAsync(dst, src, ${ Math.round( m.bytes ).toLocaleString( 'en-AU' ) })`, 'cmd' );
	proc.write( `${ fmtBytes( m.bytes ) } over ${ s.link.name } at ${ m.effective.toFixed( 1 ) } GB/s → ${ fmtTime( m.seconds ) }`, 'ok' );

} );

function logCopy( what ) {

	const s = worlds.transfer.getState();
	proc.write( `${ what }: ${ s.format.name } · ${ s.link.name } · ${ fmtBytes( s.bytes ) } → ${ fmtTime( s.seconds ) }`, 'calc' );

}

const xferScrub = makeScrubber( 'transfer', TRANSFER_STEPS.length, ( i ) => {

	worlds.transfer.setStep( i );
	setCard( 'transfer', i );
	xferTrace( i );
	flyTo( worlds.transfer.getStepView( i ) );
	renderXferTable();

} );

function renderXferTable() {

	const s = worlds.transfer.getState();
	document.getElementById( 'xfer-table' ).innerHTML = `
		<tbody>
			<tr><td>tensor</td><td class="num">${ s.n.toLocaleString( 'en-AU' ) }</td></tr>
			<tr class="is-pick"><td class="tag">${ s.format.short }</td><td class="num">${ fmtBytes( s.bytes ) }</td></tr>
			<tr><td>link</td><td class="num">${ s.link.gbs } GB/s</td></tr>
			<tr class="${ s.isPinned ? '' : 'is-warn' }"><td>effective</td><td class="num">${ s.effective.toFixed( 1 ) } GB/s</td></tr>
			<tr><td>copy</td><td class="num">${ fmtTime( s.seconds ) }</td></tr>
			<tr><td>HBM read</td><td class="num">${ fmtTime( s.bytes / 8e12 ) }</td></tr>
			<tr><td>pinned pages</td><td class="num">${ Math.ceil( s.bytes / 4096 ).toLocaleString( 'en-AU' ) }</td></tr>
		</tbody>`;

	document.getElementById( 'xfer-summary' ).textContent = s.link.key === 'hbm'
		? `no bus at all — this is the GPU reading ${ fmtBytes( s.bytes ) } out of its own memory`
		: `${ fmtTime( s.seconds ) } to arrive · ${ fmtTime( s.bytes / 8e12 ) } for the GPU to read the same bytes from HBM · ${ ( s.seconds / ( s.bytes / 8e12 ) ).toFixed( 0 ) }×`;

}

function xferHeader() {

	const s = worlds.transfer.getState();
	proc.clear();
	proc.setTitle( 'copy — host to device' );
	proc.setStatus( 'computed', 'done' );
	proc.write( `t = torch.empty(${ s.shape.dims.join( ', ' ) }, dtype=${ s.format.name })`, 'cmd' );
	proc.write( `size     ${ fmtBytes( s.bytes ) }  ·  ${ bitsPerValue( s.format ) } bits per value`, 'out' );
	proc.write( `link     ${ s.link.name }  ${ s.link.gbs } GB/s`, 'dim' );
	proc.rule();

}

function xferTrace( i ) {

	const s = worlds.transfer.getState();
	proc.write( `${ i + 1 }. ${ TRANSFER_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		proc.write( `${ Math.ceil( s.bytes / 4096 ).toLocaleString( 'en-AU' ) } pages of 4 KiB, scattered across physical RAM`, 'out' );
		proc.write( 'the kernel is free to move or swap any of them', 'dim' );

	} else if ( i === 1 ) {

		proc.write( `pinned    ${ fmtTime( s.bytes / ( s.link.gbs * 1e9 ) ) }`, 'ok' );
		proc.write( `pageable  ${ fmtTime( s.bytes / ( s.link.gbs * 1e9 * 0.45 ) ) }   (staged through a driver buffer)`, 'warn' );
		proc.write( 'pinning is not free either — the pages leave the pool the OS can reclaim', 'note' );

	} else if ( i === 2 ) {

		LINKS.slice( 0, 4 ).forEach( ( l ) => proc.write( `${ l.name.padEnd( 14 ) } ${ String( l.gbs ).padStart( 5 ) } GB/s   ${ fmtTime( s.bytes / ( l.gbs * 1e9 ) ) }`, l.key === s.link.key ? 'calc' : 'out' ) );
		proc.write( `same tensor in nvfp4: ${ fmtTime( bytesOf( s.n, BY_KEY.nvfp4 ) / ( s.link.gbs * 1e9 ) ) } — the format is the transfer time`, 'note' );

	} else if ( i === 3 ) {

		proc.write( `HBM3e     8000 GB/s   ${ fmtTime( s.bytes / 8e12 ) }`, 'ok' );
		proc.write( `${ s.link.name.padEnd( 14 ) } ${ String( s.link.gbs ).padStart( 5 ) } GB/s   ${ fmtTime( s.seconds ) }`, 'out' );
		proc.write( `the bus is ${ ( 8000 / s.link.gbs ).toFixed( 0 ) }× slower than the memory it is filling`, 'warn' );

	} else if ( i === 4 ) {

		proc.write( 'registers  ~256 KB per SM     ~100 TB/s', 'out' );
		proc.write( 'shared     up to 228 KB/SM    ~30 TB/s', 'out' );
		proc.write( 'L2         50–126 MB           ~10 TB/s', 'out' );
		proc.write( 'HBM        80–192 GB          3.35–8 TB/s', 'out' );
		proc.write( `decode reads every weight once: ${ fmtBytes( s.bytes ) } / 8 TB/s = ${ fmtTime( s.bytes / 8e12 ) } per token for this tensor alone`, 'calc' );

	} else {

		proc.write( 'cast on the host, then copy — never copy fp32 and cast on the device', 'out' );
		proc.write( 'pin the buffers that move every step, and copy on a second stream', 'out' );
		proc.write( `fp32 ${ fmtTime( bytesOf( s.n, BY_KEY.fp32 ) / ( s.link.gbs * 1e9 ) ) }  →  nvfp4 ${ fmtTime( bytesOf( s.n, BY_KEY.nvfp4 ) / ( s.link.gbs * 1e9 ) ) } on ${ s.link.name }`, 'calc' );
		proc.write( 'weights cross once and stay; activations and KV cache are the ones that keep moving', 'note' );

	}

}


let intStep = 0;

const B_MAX = 8192;
const toBatch = ( t ) => Math.max( 1, Math.round( B_MAX ** t ) );

const batchSlider = document.getElementById( 'batch-slider' );
const batchReadout = document.getElementById( 'batch-readout' );
const mfuSlider = document.getElementById( 'mfu-slider' );
const mfuReadout = document.getElementById( 'mfu-readout' );

batchSlider.addEventListener( 'input', () => {

	const b = toBatch( parseFloat( batchSlider.value ) );
	batchReadout.textContent = b.toLocaleString( 'en-AU' );
	worlds.intensity.setBatch( b );
	renderIntTable();

} );

batchSlider.addEventListener( 'change', () => logIntensity() );

mfuSlider.addEventListener( 'input', () => {

	const v = parseFloat( mfuSlider.value );
	mfuReadout.textContent = v.toFixed( 2 );
	worlds.intensity.setMfu( v );
	renderIntTable();

} );

mfuSlider.addEventListener( 'change', () => logBudget() );

chipRow( document.getElementById( 'op-chips' ), OPS.map( ( o ) => ( { key: o.key, label: o.label } ) ), ( item ) => {

	worlds.intensity.setOp( item.key );
	renderIntTable();
	logIntensity();

}, 'relu' );

chipRow( document.getElementById( 'prec-chips' ), PRECISIONS.map( ( p ) => ( { key: p.key, label: p.label } ) ), ( item ) => {

	const s = worlds.intensity.setPrecision( item.key );
	renderIntTable();
	if ( ! s.supported ) proc.write( `${ s.acc.name } has no ${ item.key } tensor cores — the peak shown is its bf16 rate`, 'warn' );
	logIntensity();

}, 'bf16' );

chipRow( document.getElementById( 'acc-chips' ), ACCELERATORS.map( ( a ) => ( { key: a.key, label: a.name.replace( ' SXM', '' ).replace( ' 80GB', '' ) } ) ), ( item ) => {

	const s = worlds.intensity.setAccelerator( item.key );
	renderIntTable();
	proc.write( `${ s.acc.name } · ${ fmtFlops( s.peak ) } / ${ ( s.acc.bw / 1e9 ).toFixed( 0 ) } GB/s = ${ s.ridge.toFixed( 1 ) } FLOP/byte`, 'calc' );

}, 'a5000' );

chipRow( document.getElementById( 'model-chips' ), MODELS.map( ( m ) => ( { key: m.key, label: m.label } ) ), ( item ) => {

	worlds.intensity.setModel( item.key );
	renderIntTable();
	logBudget();

}, 'm1b3' );

const pickChip = ( root, key ) => {

	const c = [ ...document.getElementById( root ).children ].find( ( b ) => b.dataset.key === key );
	if ( c && ! c.classList.contains( 'active' ) ) c.click();

};

const intScrub = makeScrubber( 'intensity', INTENSITY_STEPS.length, ( i ) => {

	intStep = i;
	worlds.intensity.setStep( i );
	if ( i === 5 && worlds.intensity.getState().op.key === 'linear' ) pickChip( 'op-chips', 'relu' );
	if ( i === 6 ) pickChip( 'op-chips', 'linear' );
	setCard( 'intensity', i );
	intTrace( i );
	flyTo( worlds.intensity.getStepView( i ) );
	renderIntTable();

} );

function renderIntTable() {

	const s = worlds.intensity.getState();
	const budget = intStep <= 3;
	document.getElementById( 'int-head' ).textContent = budget ? 'This run' : 'This kernel';

	const rows = budget ? [
		[ 'accelerator', `${ s.acc.name } · ${ s.prec.label }` ],
		[ 'promised', fmtFlops( s.peak ) ],
		[ 'seconds / week', WEEK.toLocaleString( 'en-AU' ) ],
		[ 'peak / week', eng( s.weekPeak ) ],
		[ 'MFU', s.mfu.toFixed( 2 ) ],
		[ 'actual / week', eng( s.weekActual ) ],
		[ 'params that fit', fmtCount( s.fits ) ],
		[ `${ s.model.label } · 6ND`, eng( s.need ) ],
		[ 'weeks on one card', s.weeks.toFixed( 1 ) ],
	] : [
		[ 'operator', s.op.label ],
		[ 'batch B', s.batch.toLocaleString( 'en-AU' ) ],
		[ 'FLOPs', eng( s.ev.flops ) ],
		[ 'bytes', eng( s.ev.bytes ) ],
		[ 'intensity', `${ s.ev.i.toFixed( 3 ) } F/B` ],
		[ 'accelerator', `${ s.ridge.toFixed( 1 ) } F/B` ],
		[ 'attained', fmtFlops( s.ev.attain ) ],
		[ 'time', `${ eng( s.ev.seconds ) } s` ],
	];

	document.getElementById( 'int-table' ).innerHTML = `
		<tbody>
			${ rows.map( ( [ a, b ] ) => `<tr><td>${ a }</td><td class="num">${ b }</td></tr>` ).join( '' ) }
			<tr class="${ budget ? 'is-pick' : s.ev.bound === 'memory' ? 'is-warn' : 'is-pick' }"><td class="tag">${ budget ? 'memory' : 'bound by' }</td><td class="num">${ budget ? fmtGB( s.acc.mem ) : s.ev.bound }</td></tr>
		</tbody>`;

	document.getElementById( 'int-summary' ).textContent = budget
		? `${ eng( s.weekActual ) } FLOPs a week at MFU ${ s.mfu.toFixed( 2 ) } · ${ eng( s.tokensPerWeek ) } tokens of ${ s.model.label }`
		: `${ s.ev.i.toFixed( 3 ) } ${ s.ev.bound === 'memory' ? '<' : '>' } ${ s.ridge.toFixed( 1 ) } FLOP/byte · ${ ( s.ev.computeUtil * 100 ).toFixed( 1 ) }% of the array, ${ ( s.ev.memoryUtil * 100 ).toFixed( 0 ) }% of the bus`;

}

function logIntensity() {

	const s = worlds.intensity.getState();
	proc.write( `${ s.op.label } · B ${ s.batch } · ${ s.prec.label } → ${ eng( s.ev.flops ) } FLOPs / ${ eng( s.ev.bytes ) } B = ${ s.ev.i.toFixed( 3 ) } FLOP/byte · ${ s.ev.bound }-bound`, s.ev.bound === 'compute' ? 'ok' : 'warn' );

}

function logBudget() {

	const s = worlds.intensity.getState();
	proc.write( `mfu ${ s.mfu.toFixed( 2 ) } → ${ eng( s.weekActual ) } FLOPs/week · ${ s.model.label } needs ${ eng( s.need ) } → ${ s.weeks.toFixed( 1 ) } weeks`, 'calc' );

}

function intHeader() {

	const s = worlds.intensity.getState();
	proc.clear();
	proc.setTitle( 'intensity — FLOPs per byte' );
	proc.setStatus( 'computed', 'done' );
	proc.write( `${ s.acc.name }  ${ s.acc.arch }`, 'cmd' );
	proc.write( `promised   ${ fmtFlops( s.peak ) } dense ${ s.prec.label }`, 'out' );
	proc.write( `bandwidth  ${ ( s.acc.bw / 1e9 ).toFixed( 0 ) } GB/s  ·  ${ fmtGB( s.acc.mem ) }`, 'out' );
	proc.write( `intensity  ${ eng( s.peak ) } / ${ eng( s.acc.bw ) } = ${ s.ridge.toFixed( 1 ) } FLOP/byte`, 'dim' );
	proc.rule();

}

function intTrace( i ) {

	const s = worlds.intensity.getState();
	proc.write( `${ i + 1 }. ${ INTENSITY_STEPS[ i ].title }`, 'head' );

	if ( i === 0 ) {

		proc.write( 'y[i, j] = Σ_k x[i, k] · W[k, j]', 'cmd' );
		proc.write( `k = ${ MM.k } multiplies + ${ MM.k } adds = ${ 2 * MM.k } FLOPs per output cell`, 'calc' );
		proc.write( `m · n = ${ MM.m * MM.n } cells → 2 · ${ MM.m } · ${ MM.k } · ${ MM.n } = ${ 2 * MM.m * MM.k * MM.n } FLOPs`, 'out' );
		proc.write( `(B, ${ D_MODEL }) @ (${ D_MODEL }, ${ D_FF }) → ${ eng( 2 * D_MODEL * D_FF ) } · B FLOPs`, 'dim' );
		proc.write( 'a bias add is 2mn and a layernorm is a few mn — the matmul is the run', 'note' );

	} else if ( i === 1 ) {

		proc.write( 'forward    2 FLOPs per parameter per token', 'out' );
		proc.write( 'backward   4 — one gradient for the input, one for the weight', 'out' );
		proc.write( 'C = 6 · N · D', 'cmd' );
		proc.write( `${ s.model.label }: 6 · ${ eng( s.model.n ) } · ${ eng( s.tokens ) } = ${ eng( 6 * s.model.n * s.tokens ) }`, 'calc' );
		proc.write( `attention  12 · L · d · T · D = ${ eng( s.need - 6 * s.model.n * s.tokens ) }   (T / 6d = ${ ( attnShare( s.model ) * 100 ).toFixed( 1 ) }%)`, 'out' );
		proc.write( `total ${ eng( s.need ) } FLOPs`, 'ok' );

	} else if ( i === 2 ) {

		proc.write( `${ s.acc.name }   ${ fmtFlops( s.peak ) } dense ${ s.prec.label }`, 'cmd' );
		proc.write( `week = 7 · 24 · 3600 = ${ WEEK.toLocaleString( 'en-AU' ) } s`, 'out' );
		proc.write( `${ eng( s.peak ) } · ${ eng( WEEK ) } = ${ eng( s.weekPeak ) } FLOPs`, 'calc' );
		proc.write( `memory  ${ fmtGB( s.acc.mem ) } / ${ BYTES_PER_PARAM } B per param = ${ fmtCount( s.fits ) } parameters`, 'out' );
		proc.write( 'AdamW mixed precision: 2 + 2 bf16, 4 + 4 + 4 fp32 master and moments', 'dim' );
		proc.write( 'capacity picks N, the FLOP budget picks D', 'note' );

	} else if ( i === 3 ) {

		proc.write( 'mfu = actual_flop_per_sec / promised_flop_per_sec', 'cmd' );
		proc.write( `${ s.mfu.toFixed( 2 ) } × ${ eng( s.weekPeak ) } = ${ eng( s.weekActual ) } FLOPs a week`, 'calc' );
		proc.write( `tokens = C / (6N + 12·L·d·T) = ${ eng( s.tokensPerWeek ) } for ${ s.model.label }`, 'out' );
		proc.write( `${ s.model.label } on ${ eng( s.tokens ) } tokens → ${ s.weeks.toFixed( 1 ) } weeks on one card`, s.weeks > 4 ? 'warn' : 'ok' );
		proc.write( '≥ 0.5 is a good run, and it rises when matmuls dominate', 'note' );
		proc.write( 'what is missing: elementwise kernels, softmax, communication, and every stalled byte', 'dim' );

	} else if ( i === 4 ) {

		proc.write( 'intensity = FLOPs / bytes moved', 'cmd' );
		proc.write( `accelerator intensity = ${ eng( s.peak ) } / ${ eng( s.acc.bw ) } = ${ s.ridge.toFixed( 1 ) } FLOP/byte`, 'calc' );
		proc.write( 'below it  memory-bound — the array waits on the bus', 'out' );
		proc.write( 'above it  compute-bound — the bus waits on the array', 'out' );
		OPS.forEach( ( o ) => {

			const e = evaluate( o, s.batch, s.acc, s.prec.key );
			proc.write( `${ o.label.padEnd( 7 ) } ${ e.i.toFixed( 3 ).padStart( 10 ) } FLOP/byte   ${ e.bound }-bound`, e.bound === 'compute' ? 'ok' : 'warn' );

		} );

	} else if ( i === 5 ) {

		const e = s.prec.bytes;
		proc.write( 'relu(x) = max(x, 0)   →   1 FLOP per element', 'cmd' );
		proc.write( 'gelu(x) = 0.5x (1 + tanh(√(2/π)(x + 0.044715x³)))', 'cmd' );
		GELU_TERMS.forEach( ( [ t, n ] ) => proc.write( `  ${ t.padEnd( 14 ) } ${ n }`, 'dim' ) );
		proc.write( `  ${ 'total'.padEnd( 14 ) } ${ GELU_FLOPS } FLOPs per element`, 'out' );
		proc.write( `bytes = ${ e } read + ${ e } written = ${ 2 * e } per element, whichever function it is`, 'out' );
		proc.write( `relu ${ ( 1 / ( 2 * e ) ).toFixed( 3 ) }   gelu ${ ( GELU_FLOPS / ( 2 * e ) ).toFixed( 3 ) }   both far under ${ s.ridge.toFixed( 0 ) }`, 'calc' );
		const r = evaluate( BY_OP.relu, s.batch, s.acc, s.prec.key );
		const g = evaluate( BY_OP.gelu, s.batch, s.acc, s.prec.key );
		proc.write( `time  relu ${ eng( r.seconds ) } s   gelu ${ eng( g.seconds ) } s   — the same`, 'warn' );
		proc.write( `${ GELU_FLOPS }× the arithmetic is free; only fusion removes the bytes`, 'note' );

	} else {

		proc.write( 'I = 2BDF / e(BD + DF + BF)', 'cmd' );
		proc.write( `D = ${ D_MODEL }   F = ${ D_FF }   e = ${ s.prec.bytes } bytes`, 'dim' );
		[ 1, 8, 64, Math.ceil( s.ridgeBatch ), 512, 4096 ].forEach( ( b ) => {

			if ( ! isFinite( b ) ) return;
			const e = evaluate( BY_OP.linear, b, s.acc, s.prec.key );
			proc.write( `B = ${ String( b ).padStart( 5 ) }   I = ${ e.i.toFixed( 2 ).padStart( 9 ) }   ${ e.bound }-bound   ${ fmtFlops( e.attain ) }`, e.bound === 'compute' ? 'ok' : 'warn' );

		} );
		proc.write( `ridge at B ≈ ${ isFinite( s.ridgeBatch ) ? Math.ceil( s.ridgeBatch ) : '∞' } on ${ s.acc.name }`, 'calc' );
		proc.write( 'B = 1 is decoding: the whole weight matrix read to produce one row of output', 'note' );

	}

}

const detailCard = document.getElementById( 'detail-card' );
document.getElementById( 'detail-close' ).addEventListener( 'click', closeDetail );

function openDetail( payload ) {

	if ( ! payload ) return;
	document.getElementById( 'detail-category' ).textContent = payload.category || '';
	document.getElementById( 'detail-name' ).textContent = payload.name || '';
	document.getElementById( 'detail-blurb' ).textContent = payload.blurb || '';
	document.getElementById( 'detail-description' ).textContent = payload.description || '';
	const hasMetric = Boolean( payload.metric );
	document.getElementById( 'detail-metric-block' ).classList.toggle( 'hidden', ! hasMetric );
	if ( hasMetric ) {

		document.getElementById( 'detail-metric-label' ).textContent = payload.metricLabel || 'Value';
		document.getElementById( 'detail-metric' ).textContent = payload.metric;

	}
	detailCard.classList.add( 'open' );
	detailCard.setAttribute( 'aria-hidden', 'false' );

}

function closeDetail() {

	detailCard.classList.remove( 'open' );
	detailCard.setAttribute( 'aria-hidden', 'true' );

}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function visibleChain( object ) {

	let o = object;
	while ( o ) { if ( ! o.visible ) return false; o = o.parent; }
	return true;

}

renderer.domElement.addEventListener( 'pointerdown', ( event ) => {

	const rect = renderer.domElement.getBoundingClientRect();
	pointer.x = ( ( event.clientX - rect.left ) / rect.width ) * 2 - 1;
	pointer.y = -( ( event.clientY - rect.top ) / rect.height ) * 2 + 1;
	raycaster.setFromCamera( pointer, camera );

	const hits = raycaster.intersectObjects( worlds[ currentKey ].interactables, true )
		.filter( ( h ) => visibleChain( h.object ) && h.object.userData.kind );

	if ( ! hits.length ) return;
	openDetail( worlds[ currentKey ].describe( hits[ 0 ].object ) );

} );

const navLinks = document.querySelectorAll( '.nav-link' );
const worldPanels = document.querySelectorAll( '.world' );

function setWorldLabelsVisible( key, visible ) {

	worlds[ key ].scene.traverse( ( obj ) => {

		if ( obj.isCSS2DObject ) obj.element.style.display = visible ? '' : 'none';

	} );

}

const ENTER = { tensor: enterTensor, formats: enterFormats, transfer: enterTransfer, intensity: enterIntensity };

// Opening a page should read as the whole workflow, not a close-up of step 1.
// Once the reader has scrubbed, coming back keeps the view they were on.
function entryView( world, index ) {

	return index === 0 && world.getOverview ? world.getOverview() : world.getStepView( index );

}

function switchWorld( key ) {

	if ( key === currentKey || ! worlds[ key ] ) return;

	tensorScrub.stop();
	fmtScrub.stop();
	xferScrub.stop();
	intScrub.stop();
	closeDetail();

	setWorldLabelsVisible( currentKey, false );
	currentKey = key;
	document.body.dataset.world = key;
	navLinks.forEach( ( b ) => b.classList.toggle( 'active', b.dataset.goto === key ) );
	worldPanels.forEach( ( p ) => p.classList.toggle( 'is-active', p.dataset.worldPanel === key ) );

	renderPipeline.outputNode = sceneOutputs[ key ];
	renderPipeline.needsUpdate = true;
	setWorldLabelsVisible( key, true );

	ENTER[ key ]();

}

navLinks.forEach( ( btn ) => btn.addEventListener( 'click', () => switchWorld( btn.dataset.goto ) ) );

function enterTensor() {

	worlds.tensor.setStep( tensorScrub.index );
	tensorHeader();
	tensorTrace( tensorScrub.index );
	setCard( 'tensor', tensorScrub.index );
	renderTensorTable();
	flyTo( worlds.tensor.getStepView( tensorScrub.index ) );

}

function enterFormats() {

	worlds.formats.setStep( fmtScrub.index );
	fmtHeader();
	fmtTrace( fmtScrub.index );
	setCard( 'formats', fmtScrub.index );
	renderFmtTable();
	flyTo( worlds.formats.getStepView( fmtScrub.index ) );

}

function enterTransfer() {

	worlds.transfer.setStep( xferScrub.index );
	xferHeader();
	xferTrace( xferScrub.index );
	setCard( 'transfer', xferScrub.index );
	renderXferTable();
	flyTo( entryView( worlds.transfer, xferScrub.index ) );

}

function enterIntensity() {

	worlds.intensity.setStep( intScrub.index );
	intHeader();
	intTrace( intScrub.index );
	setCard( 'intensity', intScrub.index );
	renderIntTable();
	flyTo( entryView( worlds.intensity, intScrub.index ) );

}

worlds.tensor.setPicked( tensorIndex );
applyValue( value );
setCard( 'formats', 0 );
setCard( 'transfer', 0 );
setCard( 'intensity', 0 );
renderXferTable();
renderIntTable();

navLinks.forEach( ( b ) => b.classList.toggle( 'active', b.dataset.goto === 'tensor' ) );
worldPanels.forEach( ( p ) => p.classList.toggle( 'is-active', p.dataset.worldPanel === 'tensor' ) );
Object.keys( worlds ).forEach( ( key ) => setWorldLabelsVisible( key, key === 'tensor' ) );
enterTensor();

setTimeout( () => document.getElementById( 'loading' ).classList.add( 'hidden' ), 700 );

const clock = new THREE.Clock();

renderer.setAnimationLoop( () => {

	const dt = Math.min( 0.05, clock.getDelta() );
	updateTweens( dt );
	worlds[ currentKey ].update( dt );
	controls.update();
	renderPipeline.render();
	labelRenderer.render( worlds[ currentKey ].scene, camera );

} );
