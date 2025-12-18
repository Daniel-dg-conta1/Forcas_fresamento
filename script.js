// Variáveis globais para o Gemini API
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/";
const LLM_MODEL = "gemini-1.5-flash-latest";
const TTS_MODEL = "text-to-speech";

// --- Material Presets ---
const materialPresets = {
    custom: { kc11: 2130, one_minus_mc: 0.82, name: "Personalizado" },
    aco_carbono: { kc11: 2130, one_minus_mc: 0.82, name: "Aço Carbono (CK60)" },
    aluminio: { kc11: 700, one_minus_mc: 0.75, name: "Alumínio" },
    ferro_fundido: { kc11: 1300, one_minus_mc: 0.8, name: "Ferro Fundido" }
};

// --- Funções de Ajuda ---

function formatNumber(number) {
    if (number >= 1) {
        return number.toFixed(1).replace('.', ',');
    } else {
        return number.toFixed(4).replace('.', ',');
    }
}

async function fetchWithBackoff(url, options, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.status === 429 && i < retries - 1) {
                const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response;
        } catch (error) {
            if (i === retries - 1) throw error;
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

function getApiKey() {
    return document.getElementById('api_key').value.trim();
}

function getInputs() {
    return {
        kc11: parseFloat(document.getElementById('kc11').value),
        one_minus_mc: parseFloat(document.getElementById('one_minus_mc').value),
        D: parseFloat(document.getElementById('D').value),
        Z: parseInt(document.getElementById('Z').value),
        ae: parseFloat(document.getElementById('ae').value),
        ap: parseFloat(document.getElementById('ap').value),
        vc: parseFloat(document.getElementById('vc').value),
        fz: parseFloat(document.getElementById('fz').value),
        kr_deg: parseFloat(document.getElementById('kr').value),
        eta_percent: parseFloat(document.getElementById('eta').value),
        material_name: document.getElementById('material_name').value.trim()
    };
}

function validateInputs(inputs) {
    const { kc11, one_minus_mc, D, Z, ae, ap, vc, fz, kr_deg, eta_percent } = inputs;
    const eta = eta_percent / 100;
    return ![kc11, one_minus_mc, D, Z, ae, ap, vc, fz, kr_deg, eta].some(isNaN) && D > 0 && ae <= D && eta > 0 && eta <= 1;
}

// --- Funções de Exibição/UI ---

function adicionarDetalhe(titulo, formula, resultado, unidade) {
    const output = document.getElementById('details-output');
    const detailDiv = document.createElement('div');
    detailDiv.className = 'p-3 bg-white rounded-md border border-gray-100 shadow-sm';

    let formulaLatex = '';

    if (titulo.includes("1. Ângulo de Contato Efetivo")) {
        formulaLatex = ' \\phi_s = \\arccos(1 - \\frac{2 \\cdot a_e}{D}) ';
    } else if (titulo.includes("2. N° de Dentes em Contato")) {
        formulaLatex = ' Z_c = \\lceil Z \\cdot \\frac{\\phi_s}{360^{\\circ}} \\rceil ';
    } else if (titulo.includes("3. Espessura Média do Cavaco")) {
        formulaLatex = ' h_m = \\frac{360^{\\circ}}{\\phi_s} \\cdot \\frac{f_z}{\\pi} \\cdot \\frac{a_e}{D} \\cdot \\sin(\\kappa_r) ';
    } else if (titulo.includes("4. Comprimento do Gume Ativo")) {
        formulaLatex = ' b = \\frac{a_p}{\\sin(\\kappa_r)} ';
    } else if (titulo.includes("5. Fator do Cavaco")) {
        formulaLatex = ' h_m^{(1-m_c)} ';
    } else if (titulo.includes("6. Força de Corte")) {
        formulaLatex = ' F_c = k_{c1.1} \\cdot b \\cdot Z_c \\cdot h_m^{(1-m_c)} ';
    } else if (titulo.includes("7. Potência de Corte")) {
        formulaLatex = ' P_c = \\frac{F_c \\cdot v_c}{60000} ';
    } else if (titulo.includes("8. Potência do Motor")) {
        formulaLatex = ' P_m = \\frac{P_c}{\\eta} ';
    }

    const formattedResult = formatNumber(resultado);

    detailDiv.innerHTML = `
        <p class="font-medium text-gray-800">${titulo.replace(/(\(\w{1,3}\))/g, ' ')}</p>
        <div class="math-formula text-center py-2"></div>
        <p class="text-lg font-bold text-blue-600 text-right">${formattedResult} ${unidade}</p>
    `;
    output.appendChild(detailDiv);

    const formulaElement = detailDiv.querySelector('.math-formula');

    try {
        katex.render(formulaLatex, formulaElement, {
            throwOnError: false,
            displayMode: true
        });
    } catch (e) {
        console.error("KaTeX rendering error:", e);
        formulaElement.textContent = formulaLatex;
    }
}

function exibirResultadoFinal(resultado) {
    const finalValueElement = document.getElementById('final-pm-value');
    const resultBox = document.getElementById('pm-result');
    const ttsButton = document.getElementById('tts-button');

    if (isNaN(resultado) || !isFinite(resultado)) {
        finalValueElement.textContent = 'ERRO DE CÁLCULO';
        finalValueElement.className = 'text-3xl font-extrabold text-red-600';
        resultBox.className = 'result-box p-4 rounded-lg shadow-md error flex justify-between items-center';
        ttsButton.disabled = true;
    } else {
        finalValueElement.textContent = `${resultado.toFixed(2).replace('.', ',')} kW`;
        finalValueElement.className = 'text-3xl font-extrabold text-blue-600';
        resultBox.className = 'result-box p-4 rounded-lg shadow-md flex justify-between items-center';
        ttsButton.disabled = false;
    }
}

// --- Lógica Principal de Cálculo ---

function calcularPotencia() {
    document.getElementById('details-output').innerHTML = '';
    document.getElementById('final-pm-value').textContent = '-- kW';
    document.getElementById('tts-button').disabled = true;

    const inputs = getInputs();
    if (!validateInputs(inputs)) {
        document.getElementById('details-output').innerHTML = '<p class="text-red-500 font-semibold">Erro: Verifique se todos os campos foram preenchidos corretamente e se os valores são válidos (Ex: D > 0, &eta; entre 0 e 100%).</p>';
        exibirResultadoFinal(NaN);
        return;
    }

    const { kc11, one_minus_mc, D, Z, ae, ap, vc, fz, kr_deg, eta_percent } = inputs;
    const eta = eta_percent / 100;
    const kr_rad = kr_deg * (Math.PI / 180);
    const cos_phi_s = 1 - (2 * ae / D);

    if (cos_phi_s < -1) {
        document.getElementById('details-output').innerHTML = '<p class="text-red-500 font-semibold">Erro: a_e (largura radial) é maior que D. Esta configuração é inválida para fresamento periférico.</p>';
        exibirResultadoFinal(NaN);
        return;
    }

    const phi_s_rad = Math.acos(Math.max(-1, Math.min(1, cos_phi_s)));
    const phi_s_deg = phi_s_rad * (180 / Math.PI);
    adicionarDetalhe("1. Ângulo de Contato Efetivo ($\phi_s$)", "", phi_s_deg, "graus");

    const Zc_float = Z * (phi_s_deg / 360);
    const Zc = Math.ceil(Zc_float);
    adicionarDetalhe("2. N° de Dentes em Contato ($Z_c$)", "", Zc_float, `dentes (Zc usado: ${Zc})`);

    const hm = (360 / phi_s_deg) * (fz / Math.PI) * (ae / D) * Math.sin(kr_rad);
    adicionarDetalhe("3. Espessura Média do Cavaco ($h_m$)", "", hm, "mm");

    const b = ap / Math.sin(kr_rad);
    adicionarDetalhe("4. Comprimento do Gume Ativo ($b$)", "", b, "mm");

    const hm_power = Math.pow(hm, one_minus_mc);
    const Fc = kc11 * b * Zc * hm_power;
    adicionarDetalhe("5. Fator do Cavaco", "", hm_power, "fator");
    adicionarDetalhe("6. Força de Corte ($F_c$)", "", Fc, "N");

    const Pc = (Fc * vc) / 60000;
    adicionarDetalhe("7. Potência de Corte ($P_c$)", "", Pc, "kW");

    const Pm = Pc / eta;
    adicionarDetalhe("8. Potência do Motor ($P_m$)", "", Pm, "kW");

    exibirResultadoFinal(Pm);
}

// --- Funções da API Gemini ---

async function analisarParametros() {
    const apiKey = getApiKey();
    if (!apiKey) {
        alert("Por favor, insira sua chave da API Gemini para usar os recursos de IA.");
        return;
    }

    const analysisButton = document.getElementById('analysis-button');
    const analysisText = document.getElementById('analysis-text');
    const analysisOutput = document.getElementById('analysis-output');
    const analysisContent = document.getElementById('analysis-content');
    const inputs = getInputs();
    const Pm_value = document.getElementById('final-pm-value').textContent;

    if (!validateInputs(inputs) || Pm_value.includes('--')) {
        analysisOutput.classList.remove('hidden');
        analysisContent.innerHTML = '<p class="text-red-500">Por favor, preencha todos os parâmetros e execute o cálculo da potência antes de solicitar a análise.</p>';
        return;
    }

    analysisButton.disabled = true;
    analysisText.innerHTML = '<div class="loading-animation"></div> Analisando...';
    analysisOutput.classList.remove('hidden');
    analysisContent.innerHTML = '<p class="text-center text-gray-500">Gerando análise de usinagem...</p>';

    const systemPrompt = `Você é um engenheiro de produção especialista em usinagem. Sua tarefa é analisar um conjunto de parâmetros de fresamento periférico e fornecer um resumo conciso (em português).

    REGRAS DE FORMATAÇÃO:
    - NÃO use LaTeX, Markdown, ou qualquer formatação especial para variáveis (como $, \\, ^).
    - Use apenas abreviações de texto simples para variáveis:
      - Velocidade de corte: use 'vc'
      - Avanço por dente: use 'fz'
      - Largura radial: use 'ae'
      - Profundidade axial: use 'ap'
      - Diâmetro: use 'D'
      - Potência do motor: use 'Pm'
    - O resumo deve ter no máximo 4 parágrafos curtos.

    Avalie:
    1. A adequação dos parâmetros (vc, fz) para o material fornecido.
    2. A relação entre a largura radial de corte (ae) e o diâmetro da fresa (D).
    3. Sugira uma otimização simples (aumentar ou diminuir um parâmetro) para melhorar a produtividade ou a vida útil da ferramenta.

    Use apenas as informações fornecidas e seu conhecimento técnico. Não mencione os valores de kc1.1 ou 1-mc.`;
    const userQuery = `Análise de parâmetros de fresamento:
        Material: ${inputs.material_name}, D: ${inputs.D}mm, Z: ${inputs.Z}, ae: ${inputs.ae}mm, ap: ${inputs.ap}mm, vc: ${inputs.vc}m/min, fz: ${inputs.fz}mm, Pm: ${Pm_value}`;

    try {
        const url = `${GEMINI_API_URL}${LLM_MODEL}:generateContent?key=${apiKey}`;
        const payload = {
            contents: [{ parts: [{ text: userQuery }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
        };
        const response = await fetchWithBackoff(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "Falha ao gerar análise.";
        analysisContent.innerHTML = `<p class="whitespace-pre-wrap">${text}</p>`;
    } catch (error) {
        console.error("Erro ao chamar a API Gemini para análise:", error);
        analysisContent.innerHTML = `<p class="text-red-500">Erro na comunicação com a IA: ${error.message}. Tente novamente.</p>`;
    } finally {
        analysisButton.disabled = false;
        analysisText.textContent = '✨ Analisar Parâmetros de Corte';
    }
}

async function falarResultado() {
    const apiKey = getApiKey();
    if (!apiKey) {
        alert("Por favor, insira sua chave da API Gemini para usar os recursos de IA.");
        return;
    }

    const ttsButton = document.getElementById('tts-button');
    const resultValue = document.getElementById('final-pm-value').textContent;

    if (ttsButton.disabled) return;

    const originalText = ttsButton.innerHTML;
    ttsButton.innerHTML = '<div class="loading-animation"></div> Gerando Áudio...';
    ttsButton.disabled = true;

    const textToSpeak = `A potência do motor calculada é de ${resultValue} quilowatts.`;

    try {
        const url = `${GEMINI_API_URL}${TTS_MODEL}:synthesizeSpeech?key=${apiKey}`;
        const payload = {
            input: { text: textToSpeak },
            voice: { languageCode: 'pt-BR' },
            audioConfig: { audioEncoding: 'MP3' }
        };
        const response = await fetchWithBackoff(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        const audioContent = result.audioContent;

        if (audioContent) {
            const audio = new Audio("data:audio/mp3;base64," + audioContent);
            audio.play().catch(e => console.error("Erro ao reproduzir áudio:", e));
            audio.onended = () => {
                 ttsButton.innerHTML = originalText;
                 ttsButton.disabled = false;
            };
        } else {
            console.error("Resposta TTS inválida.");
            ttsButton.innerHTML = "Erro TTS";
        }
    } catch (error) {
        console.error("Erro ao chamar a API Gemini TTS:", error);
        ttsButton.innerHTML = "Erro TTS";
    } finally {
         setTimeout(() => {
             if (ttsButton.innerHTML === "Erro TTS") {
                 ttsButton.innerHTML = originalText;
                 ttsButton.disabled = false;
             }
         }, 3000);
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    const materialPreset = document.getElementById('material_preset');
    const kc11Input = document.getElementById('kc11');
    const oneMinusMcInput = document.getElementById('one_minus_mc');
    const materialNameInput = document.getElementById('material_name');

    materialPreset.addEventListener('change', (e) => {
        const selectedPreset = materialPresets[e.target.value];
        if (selectedPreset) {
            kc11Input.value = selectedPreset.kc11;
            oneMinusMcInput.value = selectedPreset.one_minus_mc;
            materialNameInput.value = selectedPreset.name;
        }
    });

    // Executa o cálculo com os valores padrão ao carregar a página
    calcularPotencia();
});