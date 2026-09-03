export const TENSOR_STEPS = [
	{
		kicker: 'rank',
		title: 'A tensor is an array with a rank',
		desc: 'Rank 0 is a scalar, rank 1 a vector, rank 2 a matrix. Above that the words run out and everything is just a tensor of rank n. Nothing about the numbers changes — only how many indices you need to name one.',
		formula: '()   →   (8,)   →   (6, 8)   →   (3, 6, 8)',
	},
	{
		kicker: 'shape',
		title: 'Shape is the only structure',
		desc: 'The shape lists the length of each axis; its product is the element count. A tensor is not a shape though — it is a buffer plus the metadata needed to read it: shape, stride, dtype, device.',
		formula: 'numel = 3 · 6 · 8 = 144',
	},
	{
		kicker: 'layout',
		title: 'Memory has one axis, not three',
		desc: 'DRAM is a flat run of byte addresses. Every rank-n tensor is unrolled onto that tape, last axis fastest — row-major, the C order PyTorch and NumPy default to. The rectangle is a fiction the strides maintain.',
		formula: 'offset(r, c) = r · 8 + c',
	},
	{
		kicker: 'stride',
		title: 'Strides do the fiction',
		desc: 'One stride per axis: how many elements to step to move one along that axis. Indexing is a dot product against the index tuple, so reading any element is one multiply-add and one load.',
		formula: 'offset = Σ i[k] · stride[k]   ·   stride = (8, 1)',
	},
	{
		kicker: 'views',
		title: 'A transpose moves no bytes',
		desc: 'Swap the shape and the strides and the same buffer reads as its own transpose — free, instant, and no longer contiguous. That is why .contiguous() and .reshape() sometimes cost a full copy and sometimes cost nothing.',
		formula: '.T  →  shape (8, 6)  stride (1, 8)   ·   same buffer',
	},
	{
		kicker: 'accounting',
		title: 'The whole bill is two numbers',
		desc: 'Element count times bytes per element. Everything else in memory accounting — activations, gradients, optimiser state, KV cache — is this identity applied again. The second number is the one you get to choose.',
		formula: 'bytes = numel × itemsize',
	},
];

export const FORMAT_STEPS = [
	{
		kicker: 'anatomy',
		title: 'Three fields, one number',
		desc: 'A float is a sign, an exponent that places the value on a power-of-two scale, and a fraction that positions it inside that octave. The exponent buys range; the fraction buys precision. Every format is a different split of the same budget.',
		formula: 'x = (−1)^s · 2^(E − bias) · 1.f',
	},
	{
		kicker: 'float32',
		title: 'float32 — the reference',
		desc: '1 sign, 8 exponent, 23 fraction. About 7 decimal digits and a range so wide nothing in a network approaches it. It is what training used to be done in and what every other format is measured against.',
		formula: '4 bytes · max 3.40e38 · step at 1.0 = 1.19e−7',
	},
	{
		kicker: 'float16',
		title: 'float16 — half the bytes, a tenth of the range',
		desc: 'Keeps 10 fraction bits but cuts the exponent to 5. Precision is fine; the range is the problem. Gradients under 6.1e−5 fall into subnormals and shed a bit of precision per octave until 5.96e−8, where they flush to zero; anything over 65,504 becomes inf. That is why fp16 training needs loss scaling and a fp32 master copy.',
		formula: '2 bytes · max 65,504 · min normal 6.10e−5',
	},
	{
		kicker: 'bfloat16',
		title: 'bfloat16 — float32 range, 8 fraction bits',
		desc: 'The opposite trade: keep all 8 exponent bits, spend the savings out of the fraction. Same range as fp32, so no loss scaling and no overflow drills; converting from fp32 is just dropping the low 16 bits. Steps at 1.0 are 8× coarser than fp16.',
		formula: '2 bytes · max 3.39e38 · step at 1.0 = 7.81e−3',
	},
	{
		kicker: 'float8',
		title: 'float8 — two formats, on purpose',
		desc: 'E4M3 holds ±448 with 3 fraction bits and carries weights and activations; E5M2 reaches ±57,344 with 2 and carries gradients, which span far more orders of magnitude. Neither has the range to survive unscaled — a per-tensor scale keeps the values inside the window.',
		formula: 'E4M3 max 448   ·   E5M2 max 57,344',
	},
	{
		kicker: 'nvfp4',
		title: 'nvfp4 — 4 bits plus a scale per 16',
		desc: 'E2M1 has 16 codes — ±{0, 0.5, 1, 1.5, 2, 3, 4, 6} — and nothing else, so it only works block-wise: every 16 values share an FP8 E4M3 scale, and the tensor carries one FP32 scale on top. 16 × 4 + 8 = 72 bits, 4.5 bits per value. MXFP4 uses 32-value blocks and a power-of-two scale — 4.25 bits, coarser.',
		formula: '(16 × 4 + 8) / 16 = 4.5 bits/value',
	},
	{
		kicker: 'the bill',
		title: 'What one weight matrix costs',
		desc: 'The same tensor, six ways. Dropping fp32 to bf16 halves it, fp8 halves it again, nvfp4 takes another 44% off. Capacity is only half of what you buy — a weight read once per token turns bytes straight into decode latency.',
		formula: '49,152 × 12,288 = 603,979,776 elements',
	},
	{
		kicker: 'choosing',
		title: 'Tall is range, wide is precision',
		desc: 'Pick range first: does the tensor hold gradients or outliers spanning many octaves? Then precision. Then check the hardware actually has a tensor core for it. Practice: bf16 for training, fp8 for large-model training and serving, nvfp4 for weights at inference with the master copy kept high.',
		formula: 'range = 2^exponent bits   ·   precision = 2^−mantissa bits',
	},
];

export const TRANSFER_STEPS = [
	{
		kicker: 'host',
		title: 'The tensor starts in the wrong memory',
		desc: 'A tensor built on the CPU lives in pageable host RAM: virtual pages the kernel is free to relocate or swap. Convenient for the process, useless for a device that wants to fetch bytes by physical address without asking.',
		formula: 'torch.empty(49152, 12288)  ·  device = cpu',
	},
	{
		kicker: 'pinning',
		title: 'DMA needs pages that cannot move',
		desc: 'Page-locked (pinned) memory is nailed to physical addresses, so the GPU DMA engine reads it directly. Copy from pageable memory and the driver first stages it through an internal pinned bounce buffer — an extra full-size host-to-host copy before the transfer even starts.',
		formula: '.pin_memory()  ·  cudaHostAlloc',
	},
	{
		kicker: 'the bus',
		title: 'Across the PCIe bus',
		desc: 'Sixteen lanes, each with its own pair of wires per direction, so both directions run at once. Gen4 x16 moves about 31.5 GB/s each way, Gen5 about 63, Gen6 about 121. The transfer time is the tensor size divided by that — which makes dtype a latency decision, not only a capacity one.',
		formula: 't = bytes / bandwidth',
	},
	{
		kicker: 'device',
		title: 'Into HBM',
		desc: 'The bytes land in the GPU\'s own DRAM: stacked HBM sitting beside the die on the same package. An H100 reads it at 3.35 TB/s, a B200 at about 8 TB/s — 50 to 130× what the bus that filled it can do.',
		formula: 'HBM3e 8 TB/s   vs   PCIe 5.0 63 GB/s',
	},
	{
		kicker: 'the die',
		title: 'HBM is still far away',
		desc: 'From HBM the bytes climb through L2, into an SM\'s shared memory, then registers, getting faster and much smaller at every step. Decoding one token reads every weight exactly once and does almost no arithmetic per byte, so it runs at HBM speed — the format you stored in is the speed you get.',
		formula: 'registers → SMEM → L2 → HBM → bus',
	},
	{
		kicker: 'strategy',
		title: 'Send less, send it once',
		desc: 'Move weights over the bus once and leave them resident. Pin the buffers that do move, cast before the copy rather than after, and overlap transfer with compute on a second stream. When a model does not fit, the format is what decides whether it stays on the device at all.',
		formula: 'cast → pin → copy_(non_blocking=True) → keep',
	},
];

export const INTENSITY_STEPS = [
	{
		kicker: 'flops',
		title: 'A matmul is 2 · m · k · n',
		desc: 'Every output cell of (m, k) @ (k, n) is a dot product of length k: k multiplies and k adds, so 2k FLOPs. There are m · n of them. That single identity is the whole of transformer arithmetic — everything else is elementwise noise around it.',
		formula: '(m, k) @ (k, n)  →  2 · m · k · n FLOPs',
	},
	{
		kicker: 'training',
		title: 'Forward 2N, backward 4N',
		desc: 'Each parameter is one multiply-add per token in the forward pass — 2 FLOPs. The backward pass computes a gradient with respect to the input and with respect to the weight, so it costs twice the forward. Six FLOPs per parameter per token, plus an attention term that scales with context, not with parameters.',
		formula: 'C ≈ 6 · N · D  +  12 · L · d · T · D',
	},
	{
		kicker: 'budget',
		title: 'One A5000, one week',
		desc: 'The card promises 111.1 TFLOP/s of dense BF16 tensor throughput. A week is 604,800 seconds. Multiply and that is the entire compute budget — before a single kernel launches. Its 24 GB is the other ceiling: AdamW mixed precision wants 16 bytes per parameter, so the same card caps the model at about 1.3B.',
		formula: '111.1e12 × 604,800 = 6.72e19 FLOPs',
	},
	{
		kicker: 'mfu',
		title: 'Model FLOPs utilisation',
		desc: 'Nothing reaches the promised number. MFU is the honest fraction: the FLOP/s the model actually did over the FLOP/s the spec sheet claims. 0.5 is a good run, and it climbs when matmuls dominate — the gap is elementwise ops, attention softmax, communication and every byte the machine waited on.',
		formula: 'mfu = actual_flop_per_sec / promised_flop_per_sec',
	},
	{
		kicker: 'the ridge',
		title: 'Memory, compute, memory',
		desc: 'A kernel reads its inputs out of HBM, does arithmetic, writes results back. Divide the FLOPs by the bytes moved and you get arithmetic intensity. Divide the accelerator\'s peak FLOP/s by its bandwidth and you get the intensity it needs to stay busy. Below that line the compute idles; above it the bus idles.',
		formula: 'accelerator intensity = peak FLOP/s / bandwidth = 145 FLOP/byte',
	},
	{
		kicker: 'elementwise',
		title: 'relu and gelu cost the same',
		desc: 'relu is 1 FLOP per element, gelu about 9. Both read one BF16 value and write one back — 4 bytes either way. That puts them at 0.25 and 2.25 FLOP/byte against a machine that needs 145, so both run at bandwidth and take exactly the same wall-clock time. Nine times the arithmetic is free; the only fix is not moving the bytes, which is what fusion does.',
		formula: 'relu 1/4 = 0.25   ·   gelu 9/4 = 2.25 FLOP/byte',
	},
	{
		kicker: 'matmul',
		title: 'A linear layer crosses the ridge',
		desc: 'A matmul reuses each loaded byte B times, so its intensity rises with batch. At B = 1 the weight matrix is read once for one row of output: intensity 1.0, pure bandwidth — that is decoding, and why a token costs what the weights weigh. Past B ≈ 147 on an A5000 the same kernel is compute-bound and the card finally does what it promised.',
		formula: 'I = 2BDF / e(BD + DF + BF)',
	},
];
