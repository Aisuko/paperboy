const KINDS = new Set( [ 'out', 'cmd', 'ok', 'warn', 'err', 'dim', 'calc', 'note', 'head' ] );

export class ProcessConsole {

	constructor( root ) {

		this.root = root;
		this.titleEl = root.querySelector( '.console-title' );
		this.statusEl = root.querySelector( '.console-status' );
		this.statusTextEl = root.querySelector( '.console-status .text' );
		this.bodyEl = root.querySelector( '.console-body' );
		this.footEl = root.querySelector( '.console-foot' );
		this._maxLines = 400;

	}

	setTitle( text ) {

		this.titleEl.textContent = text;

	}

	setStatus( text, state = 'idle' ) {

		this.statusTextEl.textContent = text;
		this.statusEl.dataset.state = state;

	}

	clear() {

		this.bodyEl.innerHTML = '';

	}

	rule() {

		const hr = document.createElement( 'div' );
		hr.className = 'log-line log-rule';
		this.bodyEl.appendChild( hr );
		this._trim();
		this._scroll();

	}

	write( text, kind = 'out', { gutter = '' } = {} ) {

		if ( text === null || text === undefined ) return null;
		if ( kind === 'rule' ) { this.rule(); return null; }

		const line = document.createElement( 'div' );
		line.className = 'log-line log-' + ( KINDS.has( kind ) ? kind : 'out' );

		if ( kind === 'head' ) {

			line.textContent = text;
			this.bodyEl.appendChild( line );
			this._trim();
			this._scroll();
			return line;

		}

		const gut = document.createElement( 'span' );
		gut.className = 'gutter';
		gut.textContent = gutter || ( kind === 'cmd' ? '$' : '' );

		const body = document.createElement( 'span' );
		body.className = 'body';
		body.append( ...markup( String( text ) ) );

		line.append( gut, body );
		this.bodyEl.appendChild( line );
		this._trim();
		this._scroll();
		return line;

	}

	_trim() {

		while ( this.bodyEl.childElementCount > this._maxLines ) {

			this.bodyEl.removeChild( this.bodyEl.firstElementChild );

		}

	}

	_scroll() {

		this.bodyEl.scrollTop = this.bodyEl.scrollHeight;

	}

}

function markup( text ) {

	const out = [];
	const re = /<(b|em)>([\s\S]*?)<\/\1>/g;
	let last = 0;
	let m;

	while ( ( m = re.exec( text ) ) !== null ) {

		if ( m.index > last ) out.push( document.createTextNode( text.slice( last, m.index ) ) );
		const el = document.createElement( m[ 1 ] );
		el.textContent = m[ 2 ];
		out.push( el );
		last = m.index + m[ 0 ].length;

	}

	if ( last < text.length ) out.push( document.createTextNode( text.slice( last ) ) );
	return out;

}
