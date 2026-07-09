// The six glossary terms from the source Transformer Flow explainer's Key
// Concepts section, reproduced verbatim.

export const GLOSSARY = [
	{
		id: 'token',
		term: 'Token',
		blurb: 'A model-recognized unit of text with a unique integer ID.',
		description: 'Tokenization splits text into model units (words or sub-words) and assigns each unit a unique integer ID. Modern LLM tokenizers commonly use subword schemes such as BPE. More tokens in the input/output sequence generally means more compute.',
		jump: 'tokenize',
	},
	{
		id: 'embedding',
		term: 'Embedding',
		blurb: 'A continuous vector representation of a token ID.',
		description: 'An embedding matrix maps each token ID to a continuous high-dimensional vector. Those vectors contain positive and negative real numbers and capture semantic relationships used by the model.',
		jump: 'tokenize',
	},
	{
		id: 'hidden-state',
		term: 'Hidden State',
		blurb: 'A per-token vector that evolves as each layer updates it.',
		description: 'Hidden states are intermediate vectors produced after each transformer layer for each token position. They encode contextual information about the sequence and evolve as every layer updates them.',
		jump: 'block',
	},
	{
		id: 'lm-head',
		term: 'LM Head',
		blurb: 'A linear projection from final hidden state to vocabulary-sized logits.',
		description: 'The language-model head is a linear projection from final hidden state to vocabulary-sized logits: logits = hidden_state x W + b.',
		jump: 'decode',
	},
	{
		id: 'softmax',
		term: 'Softmax',
		blurb: 'Normalizes logits into probabilities that sum to 1.',
		description: 'Softmax exponentiates and normalizes logits so probabilities sum to 1 across the vocabulary. By contrast, sigmoid gives a single probability for binary tasks, and ReLU is a hidden-layer activation that does not output probabilities.',
		jump: 'decode',
	},
	{
		id: 'nll',
		term: 'NLL (Negative Log-Likelihood)',
		blurb: 'The training loss taken from the correct token\'s log probability.',
		description: 'During training, NLL measures how much probability the model assigns to the correct next token: NLL = -log P(y_true | context). Lower NLL means the model is assigning higher probability to the correct token.',
		jump: 'train',
	},
];
