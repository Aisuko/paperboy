// GPT-2 small is the reference model for every number in this exhibit. Nothing
// on any page invents a shape or a dimension — if a figure appears in a panel
// or a console trace, it comes from here or is derived from it.

export const GPT2 = {
	name: 'GPT-2 small',
	nLayer: 12,
	nHead: 12,
	dModel: 768,
	dHead: 64, // dModel / nHead
	dFF: 3072, // 4 × dModel
	vocabSize: 50257,
	contextLength: 1024,
	parameters: '124M',
	// GPT-2 ties the output projection to the input embedding matrix, so the
	// "linear layer" on the output page is literally wte transposed.
	tiedEmbeddings: true,
	// GPT-2 applies LayerNorm *before* each sub-block (pre-LN), unlike the
	// original 2017 encoder-decoder Transformer, which applied it after the
	// residual add (post-LN). Both orders appear in the literature; every
	// diagram here follows GPT-2.
	normPlacement: 'pre-LN',
};

export function formatVector( values, { decimals = 4, max = 6, dims = null } = {} ) {

	const shown = values.slice( 0, max ).map( ( v ) => v.toFixed( decimals ) ).join( ', ' );
	const total = dims ?? values.length;
	return `[ ${ shown }${ total > max ? ', …' : '' } ]  (${ total } dims)`;

}
