/* /var/www/common/assets/js/pages/training-instructor-problem-result.js */

/* global $, Chart, SimulatorPage, simulatorAjaxRequest, simulatorCache, simulatorShowConfirm */

(() => {
	'use strict';

	const debugEnabled = window.SIM_DEBUG?.enabled?.() || /[?&]debug(=|&|$)/i.test(String(window.location.search || ''));
	const dlog = (...args) => { if (debugEnabled) console.log('[problem-result]', ...args); };
	const dwarn = (...args) => { if (debugEnabled) console.warn('[problem-result]', ...args); };

	if (!document.getElementById('page-data')) {
		console.error('[problem-result] missing #page-data script tag');
		return;
	}
	if (typeof SimulatorPage === 'undefined') {
		console.error('[problem-result] SimulatorPage is undefined (core js not loaded?)');
		return;
	}

	// ------------------------------------------------------------
	// 0) Helpers
	// ------------------------------------------------------------
	const tMap = (bucket, id, fallback = '') => {
		const src = window.SIM_SHARED?.[bucket];
		if (!src || typeof src !== 'object') return fallback;
		const key = String(id);
		const val = src[key];
		return (typeof val === 'string' && val.trim() !== '') ? val : fallback;
	};

	const Common = (id, fallback = '') => tMap('common_terms', id, fallback);
	const Problem = (id, fallback = '') => tMap('problem_terms', id, fallback);
	const Themes = (id, fallback = '') => tMap('themes', id, fallback);

	const mapText = (map, id, fallback = '') => {
		if (!map || typeof map !== 'object') return fallback;
		const val = map[String(id)];
		return (typeof val === 'string' && val.trim() !== '') ? val : fallback;
	};

	let resultTermsArr = [];
	let resultTermsMap = {};
	const refreshResultTerms = () => {
		resultTermsArr = Array.isArray(window.SIM_SHARED?.problem_result_terms)
			? window.SIM_SHARED.problem_result_terms
			: [];
		resultTermsMap = resultTermsArr.reduce((acc, row) => {
			if (!row || row.key_code === undefined || row.key_code === null) return acc;
			const key = String(row.key_code);
			const val = String(row.text_value ?? '');
			if (val.trim() !== '') acc[key] = val;
			return acc;
		}, {});
		if (debugEnabled) {
			console.log('[problem-result] terms loaded', {
				problem_terms: Object.keys(window.SIM_SHARED?.problem_terms || {}).length,
				problem_result_terms: resultTermsArr.length
			});
		}
	};

	const Result = (id, fallback = '') => mapText(resultTermsMap, id, fallback);
	const ResultBy = (type, itemId, element) => {
		const typeKey = String(type || '');
		const itemKey = itemId === null || itemId === undefined ? null : String(itemId);
		const elementKey = element ? String(element) : null;
		return resultTermsArr
			.filter(row => String(row?.type_code || '') === typeKey
				&& (itemKey === null ? row?.item_id == null : String(row?.item_id || '') === itemKey)
				&& (elementKey ? String(row?.item_element || '') === elementKey : true)
			)
			.sort((a, b) => Number(a?.sequence_no || 0) - Number(b?.sequence_no || 0));
	};

	const esc = (s) => String(s ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');

	const checkArr = (arr) => Array.isArray(arr) && arr.length > 0;

	const findByField = (arr, field, value) => {
		if (!Array.isArray(arr)) return null;
		for (const row of arr) {
			if (row && row[field] == value) return row;
		}
		return null;
	};


	const waitForFormsReady = async () => {
		for (let i = 0; i < 40; i++) {
			if (window.__PROBLEM_FORMS_READY_PROMISE__) break;
			await new Promise(r => setTimeout(r, 50));
		}
		if (window.__PROBLEM_FORMS_READY_PROMISE__) {
			await window.__PROBLEM_FORMS_READY_PROMISE__;
			return true;
		}
		return false;
	};

	const readPageData = () => {
		try {
			return JSON.parse(document.getElementById('page-data')?.textContent || '{}');
		} catch {
			return {};
		}
	};

	// ------------------------------------------------------------
	// 1) Parse server-provided page data
	// ------------------------------------------------------------
	const PAGE = readPageData();

	const DELIVERY_META = PAGE?.DATA?.DELIVERY_META || {};
	const EXERCISE_META = PAGE?.DATA?.EXERCISE_META || {};
	const RESULT = PAGE?.DATA?.RESULT || {};

	const exercise = Object.assign({}, RESULT.exercise || {});
	exercise.metrics = Array.isArray(RESULT.metrics) ? RESULT.metrics : [];
	exercise.successCriteria = RESULT.success_criteria || {};
	exercise.csfRaw = Array.isArray(RESULT.critical_success_factors) ? RESULT.critical_success_factors : [];

	// Normalize structure for safe access
	exercise.case = exercise.case || {};
	exercise.reference = exercise.reference || {};
	exercise.reference.actionsNotToTake = exercise.reference.actionsNotToTake || [];
	exercise.reference.symptoms = exercise.reference.symptoms || [];
	exercise.reference.facts = exercise.reference.facts || [];
	exercise.reference.causes = exercise.reference.causes || [];
	exercise.reference.actions = exercise.reference.actions || [];
	exercise.workflow = exercise.workflow || [];
	exercise.log = exercise.log || [];

	const buildScList = () => {
		const sc = exercise.successCriteria || {};
		const items = [
			{ id: 1, label: Result(56, 'Solved'), value: Number(sc.solved || 0) },
			{ id: 2, label: Result(57, 'Risk'), value: Number(sc.risk || 0) },
			{ id: 3, label: Result(58, 'Time'), value: Number(sc.time_score || 0) },
			{ id: 4, label: Result(59, 'Cost'), value: Number(sc.cost || 0) },
			{ id: 5, label: Result(60, 'Capture'), value: Number(sc.capture || 0) },
		];

		return items.map((item) => ({
			id: item.id,
			name: item.label,
			value: item.value,
			score: `${item.value} %`
		}));
	};

	const formatTimeScore = (row) => {
		const minutes = Number(row.minutes || 0);
		const seconds = Number(row.seconds || 0);
		return `${minutes} ${Result(52, 'min')} ${seconds} ${Result(120, 'sec')}`;
	};

	const csfNameForId = (id) => {
		const map = {
			11: '1A',
			12: '1B',
			21: '2A',
			22: '2B',
			31: '3A',
			32: '3B',
			33: '3C',
			41: '4A',
			42: '4B',
			43: '4C',
			44: '4D',
			91: '5'
		};
		return map[id] || `Metric ${id}`;
	};

	const buildCsfList = () => {
		const rows = Array.isArray(exercise.csfRaw) ? exercise.csfRaw : [];
		return rows.map((row) => {
			const unit = String(row.score_unit || 'number');
			const scoreValue = Number(row.score_value || 0);
			let score = String(scoreValue);

			if (unit === 'percent') score = `${scoreValue} %`;
			if (unit === 'time') score = formatTimeScore(row);

			return {
				id: Number(row.id || 0),
				name: csfNameForId(Number(row.id || 0)),
				value: Number(row.value || 0),
				score,
				minutes: Number(row.minutes || 0),
				seconds: Number(row.seconds || 0)
			};
		});
	};

	exercise.sc = [];
	exercise.csf = [];

	// Local runtime store payload for forms
	const EXERCISE_DATA = {
		ui: {
			team_no: Number(DELIVERY_META.team_no || 0),
			language_code: String(DELIVERY_META.language_code || 'en'),
		},
		meta: {
			outline_id: Number(EXERCISE_META.outline_id || 0),
			skill_id: Number(EXERCISE_META.skill_id || 0),
			exercise_no: Number(EXERCISE_META.exercise_no || 0),
			theme_id: Number(EXERCISE_META.theme_id || 0),
			scenario_id: Number(EXERCISE_META.scenario_id || 0),
			format_id: Number(EXERCISE_META.format_id || 0),
			step_no: Number(EXERCISE_META.step_no || 0),
			current_state: Number(EXERCISE_META.current_state || 0),
			next_state: Number(EXERCISE_META.next_state || 0),
			has_causality: Number(EXERCISE_META.has_causality || 0) === 1,
			number_of_causes: Number(EXERCISE_META.number_of_causes || 0),
			position_count: Number(EXERCISE_META.position_count || 0),
			role_id: Number(EXERCISE_META.role_id || 0),
			log_exercise_id: Number(EXERCISE_META.log_exercise_id || 0),
			created_at: String(EXERCISE_META.created_at || ''),
		},
		case: {
			versions: {},
			visibility: {},
			forms_plan: [],
			symptoms: [],
			facts: [],
			causes: [],
			actions: [],
			iterations: [],
			description: { short_description: '', long_description: '', work_notes: '' },
			reflections: { keep_text: '', improve_text: '' },
			attachments: { id: 0, file_name: null }
		}
	};

	const scope = {
		outline_id: Number(EXERCISE_META.outline_id || 0),
		exercise_no: Number(EXERCISE_META.exercise_no || 0),
		theme_id: Number(EXERCISE_META.theme_id || 0),
		scenario_id: Number(EXERCISE_META.scenario_id || 0)
	};

	let store = null;
	let exerciseStaticContent = null;
	let exerciseStateContent = null;

	window.ProblemExerciseStaticContent = null;
	window.ProblemExerciseStateContent = null;

	// ------------------------------------------------------------
	// 2) Data loaders
	// ------------------------------------------------------------
	const loadExerciseStaticContent = async () => {
		const lang = EXERCISE_DATA.ui.language_code || 'en';
		const cacheKey = `exercise_static:problem:v1:${scope.theme_id}:${scope.scenario_id}:${lang}`;

		const res = await simulatorAjaxRequest('/ajax/problem_exercise_static_content.php', 'POST', {}, {
			mode: 'cache',
			cacheKey,
			cacheStore: simulatorCache?.session
		});

		if (!res?.ok) {
			dwarn('static content load failed', res);
			return null;
		}

		exerciseStaticContent = res.data || null;
		window.ProblemExerciseStaticContent = exerciseStaticContent;
		return exerciseStaticContent;
	};

	const loadExerciseStateContent = async () => {
		const lang = EXERCISE_DATA.ui.language_code || 'en';
		const state = Number(EXERCISE_META.current_state || 0) || 0;
		const cacheKey = `exercise_state:problem:v1:${scope.theme_id}:${scope.scenario_id}:${state}:${lang}`;

		const res = await simulatorAjaxRequest('/ajax/problem_exercise_state_content.php', 'POST', {}, {
			mode: 'cache',
			cacheKey,
			cacheStore: simulatorCache?.session
		});

		if (!res?.ok) {
			dwarn('state content load failed', res);
			return null;
		}

		exerciseStateContent = res.data || null;
		window.ProblemExerciseStateContent = exerciseStateContent;
		return exerciseStateContent;
	};

	const refreshState = async () => {
		if (!store) return;

		const res = await simulatorAjaxRequest('/ajax/problem/exercise/state.php', 'POST', scope);
		if (!res?.ok) {
			dwarn('state load failed', res);
			return;
		}

		const data = res.data || {};
		const versions = data.versions || {};
		const forms = data.forms || {};
		const uiPlan = data?.case?.forms || null;

		store.get().case.forms_plan = Array.isArray(uiPlan) ? uiPlan : [];

		if (uiPlan && window.ProblemFormsLayout?.applyFormPlan) {
			window.ProblemFormsLayout.applyFormPlan('#problem_forms', uiPlan);
		}

		Object.keys(versions).forEach((k) => {
			store.setVersion(k, versions[k]);
		});

		if (forms.symptoms) store.get().case.symptoms = forms.symptoms;
		if (forms.facts) store.get().case.facts = forms.facts;
		if (forms.causes) store.get().case.causes = forms.causes;
		if (forms.actions) store.get().case.actions = forms.actions;
		if (forms.iterations) store.get().case.iterations = forms.iterations;
		if (forms.description) store.get().case.description = forms.description;
		if (forms.reflections) store.get().case.reflections = forms.reflections;
		if (forms.attachments) store.get().case.attachments = forms.attachments;

		if (data.case && data.case.visibility) {
			store.get().case.visibility = data.case.visibility;
		}
	};

	// ------------------------------------------------------------
	// 3) Result chart helpers (ported + hardened)
	// ------------------------------------------------------------
	const problemChartColor = (col, opa) => {
		const CHART_COLORS = {
			red: [255, 99, 132],
			orange: [255, 159, 64],
			yellow: [255, 205, 86],
			green: [75, 192, 192],
			blue: [54, 162, 235],
			purple: [153, 102, 255],
			grey: [201, 203, 207],
			black: [0, 0, 0]
		};

		const rgb = CHART_COLORS[col] || CHART_COLORS.grey;
		return `rgb(${rgb[0]},${rgb[1]},${rgb[2]},${opa})`;
	};

	const problemChartButtonsID = (type) => {
		const buttonIDs = {
			sc: [1, 2, 3, 4, 5],
			csf: [11, 12, 21, 22, 31, 32, 33, 41, 42, 43, 44, 91]
		};

		return buttonIDs[type] || [];
	};

	const problemActiveChartButtons = (id, format) => {
		const format1or11 = [1, 2, 3, 4, 41, 43];
		const otherFormats = [1, 2, 3, 4, 5, 11, 12, 21, 22, 31, 32, 33, 41, 42, 43, 44, 91];

		if ([1, 11].includes(format)) return format1or11.includes(id);
		if ([2, 3, 4, 5, 9].includes(format)) return otherFormats.includes(id);

		return false;
	};

	const problemActionLog = (exerciseLog) => {
		if (!checkArr(exerciseLog)) return [];

		const output = [];
		exerciseLog.forEach((row) => {
			if (!Object.prototype.hasOwnProperty.call(row, 'ciID') || row.ciID === null) return;

			const risk = parseInt(row.risk || 0, 10) || 0;
			const time = parseInt(row.time || 0, 10) || 0;
			const cost = parseInt(row.cost || 0, 10) || 0;
			const actionID = parseInt(row.actionID || 0, 10) || 0;
			const currentState = parseInt(row.currentState || 0, 10) || 0;
			const epochTs = parseInt(row.epochTs || 0, 10) || 0;
			const tix = parseInt(row.tix || 0, 10) || 0;
			const id = parseInt(row.id || 0, 10) || 0;
			const nextState = parseInt(row.nextState || 0, 10) || 0;
			const outcomeID = parseInt(row.outcomeID || 0, 10) || 0;
			const step = parseInt(row.step || 0, 10) || 0;

			const totalCost = (time * 1000) + cost;
			const actionType = (currentState + 5 < nextState)
				? 2
				: (risk === 0 ? 1 : 0);

			output.push(Object.assign({}, row, {
				risk,
				time,
				cost,
				actionID,
				currentState,
				epochTs,
				tix,
				id,
				nextState,
				outcomeID,
				step,
				totalCost,
				actionType,
			}));
		});

		return output;
	};

	const problemExerciseLogFirstCauseRelatedAction = (actionLog) => {
		if (!checkArr(actionLog)) return false;
		const ignored = [12, 16, 19];

		for (const row of actionLog) {
			if (!ignored.includes(parseInt(row.actionID || 0, 10))) {
				return parseInt(row.tix || 0, 10) || false;
			}
		}
		return false;
	};

	const getCis = () => {
		return Array.isArray(exerciseStaticContent?.cis) ? exerciseStaticContent.cis : [];
	};

	const getCiName = (ciID) => {
		const cis = getCis();
		const row = cis.find((c) => String(c.ci_id) === String(ciID));
		return row?.ci_text || '';
	};

	const getActionName = (actionID) => {
		return mapText(window.SIM_SHARED?.ci_actions, actionID, '');
	};

	const getDeviationText = (deviationID) => mapText(window.SIM_SHARED?.deviations, deviationID, '');

	const getFunctionText = (functionID, themeId) => {
		const rows = Array.isArray(window.SIM_SHARED?.functions) ? window.SIM_SHARED.functions : [];
		const match = rows.find((r) => Number(r.function_id || 0) === Number(functionID || 0)
			&& Number(r.theme_id || 0) === Number(themeId || 0));
		return match?.text || '';
	};

	const getCauseDeviationText = (id) => mapText(window.SIM_SHARED?.cause_deviations, id, '');

	const problemBehaviorChartCreate = () => {
		const fTerms = resultTermsMap;
		const cis = getCis();
		const functions = Array.isArray(window.SIM_SHARED?.functions)
			? window.SIM_SHARED.functions.filter(item => Number(item.theme_id || 0) === Number(exercise.theme || 0))
			: [];

		const log = exercise.log || [];
		const actionLog = problemActionLog(log);

		const getCrudType = (id) => {
			const crud = {
				1: mapText(fTerms, 96, 'Create'),
				3: mapText(fTerms, 97, 'Update'),
				4: mapText(fTerms, 98, 'Delete'),
				9: mapText(fTerms, 99, 'Merge')
			};
			return crud[id] || '';
		};

		const getFactLabelText = (id) => {
			const factLabelText = {
				what_ok: mapText(fTerms, 100, 'What working'),
				where_not: mapText(fTerms, 101, 'Where not'),
				where_ok: mapText(fTerms, 102, 'Where working'),
				when_not: mapText(fTerms, 103, 'When not'),
				when_ok: mapText(fTerms, 104, 'When working')
			};
			return factLabelText[id] || '';
		};

		const getBehaviorLabelText = (id) => {
			const behaviorLabelText = {
				1: '1. ' + mapText(fTerms, 105, 'Symptoms'),
				2: '2. ' + mapText(fTerms, 106, 'Facts'),
				3: '3. ' + mapText(fTerms, 107, 'Causes'),
				4: '4. ' + mapText(fTerms, 108, 'Actions')
			};
			return behaviorLabelText[id] || '';
		};

		const buildWorkflowDataset = () => {
			let output = [];
			if (!checkArr(exercise.workflow)) return output;

			const filtered = exercise.workflow.filter(item => parseInt(item.actionID || 0, 10) !== 19);
			filtered.forEach(item => {
				output.push({ x: parseInt(item.tix || 0, 10), y: parseInt(item.y || 0, 10) });
			});
			return output;
		};

		const buildWorkflowLabelset = () => {
			let output = [];
			if (!checkArr(exercise.workflow)) return output;

			const filtered = exercise.workflow.filter(item => parseInt(item.actionID || 0, 10) !== 19);
			filtered.forEach(item => {
				const crud = getCrudType(parseInt(item.crud || 0, 10));
				let label = crud;

				if (parseInt(item.y || 0, 10) === 1 && item.info === 'start') {
					label = mapText(fTerms, 116, 'Start');
				} else if (parseInt(item.y || 0, 10) === 1) {
					const tmpDevi = getDeviationText(item.deviationID);
					const tmpFunc = findByField(functions, 'function_id', Number(item.functionID || 0))?.text || '';
					label += ' | ' + (tmpDevi || '-') + ' ' + (tmpFunc || '-');
				} else if (parseInt(item.y || 0, 10) === 2) {
					label += ' | ' + getFactLabelText(item.info);
				} else if (parseInt(item.y || 0, 10) === 3) {
					const tmpCis3 = getCiName(item.ciID);
					label += ' | ' + (tmpCis3 || '-');
				} else if (parseInt(item.y || 0, 10) === 4) {
					const tmpCis4 = getCiName(item.ciID);
					const tmpAct4 = getActionName(item.actionID);
					label += ' | ' + (tmpCis4 || '-') + ' - ' + (tmpAct4 || '-');
				}

				output.push(label);
			});

			return output;
		};

		const buildActionDataset = () => {
			if (!checkArr(actionLog)) return [];
			return actionLog.map(item => ({ x: parseInt(item.tix || 0, 10), y: parseInt(item.totalCost || 0, 10) }));
		};

		const buildActionLabelset = () => {
			if (!checkArr(actionLog)) return [];
			return actionLog.map(item => [
				(getCiName(item.ciID) || '-') + ' - ' + (getActionName(item.actionID) || '-'),
				mapText(fTerms, 126, 'Performed by') + ' ' + (item.name || '')
			]);
		};

		const getMaxValueY2axis = (behaviorData2) => {
			if (!checkArr(behaviorData2)) return 0;
			return Math.max(...behaviorData2.map(row => row.y * 1.1));
		};

		const behaviorLabels1 = buildWorkflowLabelset();
		const behaviorLabels2 = buildActionLabelset();

		const formatObj = log.find(obj => Number(obj.format || 0) > 0) || { format: exercise.format };
		const pointRadiusAnalysis = Number(formatObj.format || 0) === 1 ? 0 : 3;
		const yAxisTicksDisplay = Number(formatObj.format || 0) === 1 ? false : true;
		const displayProcessAxis = Number(formatObj.format || 0) === 1 ? false : true;
		const displayCostAxis = Number(formatObj.format || 0) === 7 ? false : true;

		const data = {
			datasets: [
				{
					label: mapText(fTerms, 119, 'Analysis'),
					data: buildWorkflowDataset(),
					showLine: true,
					yAxisID: 'y',
					pointRadius: pointRadiusAnalysis
				},
				{
					label: mapText(fTerms, 108, 'Actions'),
					data: buildActionDataset(),
					showLine: true,
					yAxisID: 'y2',
					borderDash: [0, 6],
					borderCapStyle: 'round'
				}
			]
		};

		const config = {
			type: 'scatter',
			data,
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: {
					mode: 'point',
					intersect: false,
				},
				stacked: false,
				plugins: {
					tooltip: {
						callbacks: {
							label: function (tooltipItem) {
								if (tooltipItem.datasetIndex === 0) return behaviorLabels1[tooltipItem.dataIndex];
								if (tooltipItem.datasetIndex === 1) return behaviorLabels2[tooltipItem.dataIndex];
								return '';
							}
						}
					},
					annotation: { annotations: {} }
				},
				scales: {
					x: {
						type: 'linear',
						display: true,
						position: 'bottom',
						title: {
							display: true,
							text: mapText(fTerms, 58, 'Time')
						},
						ticks: {
							stepSize: 300,
							callback: function (value) {
								return value / 300 * 5;
							}
						}
					},
					y: {
						type: 'linear',
						display: displayProcessAxis,
						position: 'left',
						title: {
							display: false,
							text: mapText(fTerms, 117, 'Process')
						},
						ticks: {
							display: yAxisTicksDisplay,
							stepSize: 1,
							callback: function (value) {
								return getBehaviorLabelText(value);
							}
						}
					},
					y2: {
						type: 'linear',
						display: displayCostAxis,
						position: 'right',
						suggestedMin: 0,
						suggestedMax: getMaxValueY2axis(buildActionDataset()),
						title: {
							display: true,
							text: mapText(fTerms, 118, 'Cost')
						},
						ticks: {
							callback: function (value) {
								return value > 0 ? value / 1000 + 'K' : value;
							}
						},
						grid: {
							drawOnChartArea: false
						}
					}
				}
			}
		};

		const canvas = document.getElementById('behaviorChart');
		if (!canvas || !canvas.getContext) return null;

		const ctx = canvas.getContext('2d');
		return new Chart(ctx, config);
	};

	const problemChartButtonsIndicators = (id) => {
		const iCol = { good: 'green', average: 'orange', poor: 'red' };

		const getValue = (source, mid) => {
			const match = source.find((r) => Number(r.id || 0) === Number(mid || 0));
			return Number(match?.value || 0);
		};

		const highIsBest = (value, upper, lower) => {
			if (value > upper) return iCol.good;
			if (value < lower) return iCol.poor;
			return iCol.average;
		};

		const lowIsBest = (value, upper, lower) => {
			if (value < upper) return iCol.good;
			if (value > lower) return iCol.poor;
			return iCol.average;
		};

		switch (id) {
			case 1: return highIsBest(getValue(exercise.sc, id), 1, 1);
			case 2: return lowIsBest(getValue(exercise.sc, id), 2, 1);
			case 3: return lowIsBest(getValue(exercise.sc, id), 60, 1);
			case 4: return lowIsBest(getValue(exercise.sc, id), 50000, 1);
			case 5: return highIsBest(getValue(exercise.sc, id), 80, 50);
			case 11: return highIsBest(getValue(exercise.csf, id), 50, 50);
			case 12: {
				const value = getValue(exercise.csf, id);
				if (value > 0 && value <= 1200) return iCol.good;
				if (value > 0 && value <= 1200 + Math.round(1200 * 0.2)) return iCol.average;
				return iCol.poor;
			}
			case 21: return highIsBest(getValue(exercise.csf, id), 80, 60);
			case 22: {
				const value = getValue(exercise.csf, id);
				const target = 600;
				if (value > 0 && value <= target) return iCol.good;
				if (value > 0 && value <= target + Math.round(target * 0.2)) return iCol.average;
				return iCol.poor;
			}
			case 31: {
				const value = getValue(exercise.csf, id);
				const correctCause = getValue(exercise.csf, 34);
				if (correctCause && value < 3) return iCol.good;
				if (value < 2 || value > 7) return iCol.poor;
				if (value < 3 || value > 5) return iCol.average;
				return iCol.good;
			}
			case 32: {
				const value = getValue(exercise.csf, id);
				const correctCause = getValue(exercise.csf, 34);
				if (correctCause && value < 3) return iCol.good;
				if (value > 2) return iCol.good;
				if (value < 1) return iCol.poor;
				return highIsBest(value, 2, 1);
			}
			case 33: {
				const value = getValue(exercise.csf, id);
				const correctCause = getValue(exercise.csf, 34);
				if (correctCause && value <= 300) return iCol.good;
				if (value > 300 && value <= 600) return iCol.good;
				if (value > 200 && value <= 700) return iCol.average;
				return iCol.poor;
			}
			case 41:
			case 42:
			case 43:
			case 44:
				return lowIsBest(getValue(exercise.csf, id), 2, 1);
			case 91:
				return lowIsBest(getValue(exercise.csf, id), 9, 5);
			default:
				return 'grey';
		}
	};

	const problemFeedbackAdjustButtons = () => {
		const scArr = problemChartButtonsID('sc');
		const csfArr = problemChartButtonsID('csf');

		const updateButtonStyles = (arr, borderStyle) => {
			arr.forEach(id => {
				const indicatorColor = problemChartButtonsIndicators(id);
				const isActive = problemActiveChartButtons(id, Number(exercise.format || 0));

				if (indicatorColor !== 'green' && isActive) {
					$(`.wf-btn[data-id="${id}"]`).css(borderStyle, `4px solid ${indicatorColor}`);
				}
			});
		};

		const makeButtonsInactive = (arr, deselectedClass) => {
			arr.forEach(id => {
				const isActive = problemActiveChartButtons(id, Number(exercise.format || 0));
				if (!isActive) {
					$(`.chart-btn[data-id="${id}"]`).removeClass(`wf-btn ${deselectedClass}`).addClass('chart-btn-inactive');
				}
			});
		};

		updateButtonStyles(scArr, 'border-top');
		updateButtonStyles(csfArr, 'border-bottom');
		makeButtonsInactive(scArr, 'sc-button-deselected');
		makeButtonsInactive(csfArr, 'csf-button-deselected');
	};

	const problemChartAnnotationsCreate = (id, annotationArr) => {
		const metrics = exercise.metrics || [];
		const workflow = exercise.workflow || [];
		const actionLog = problemActionLog(exercise.log || []);
		const firstCauseRelatedAction = problemExerciseLogFirstCauseRelatedAction(actionLog);
		const actionsNotToTake = exercise.reference?.actionsNotToTake || [];

		const avoidableActionsFact = () => {
			if (!checkArr(actionLog) || !checkArr(actionsNotToTake)) return [];

			const tempArr = actionLog.filter(item => Number(item.currentState || 0) < 20);
			tempArr.forEach(item => {
				item.notToTake = false;
				item.notToTakeFact = false;
				actionsNotToTake.forEach(action => {
					if (String(action.ciID) === String(item.ciID)) {
						item.notToTake = true;
						item.notToTakeFact = action.fact;
					}
				});
			});

			return tempArr
				.filter(item => item.notToTake)
				.map(item => {
					switch (item.notToTakeFact) {
						case 'what': return 'what';
						case 'where': return 'where';
						case 'when': return 'when';
						default: return item.notToTakeFact;
					}
				});
		};

		const getActionIDs = (actionType, additionalFilter = () => true) => {
			if (!checkArr(actionLog)) return [];
			return actionLog
				.filter(item => item.actionType === actionType && additionalFilter(item))
				.map(item => parseInt(item.id || 0, 10));
		};

		const actionIDsc1 = () => getActionIDs(2);
		const actionIDsc2 = () => getActionIDs(0);
		const actionIDsc3 = () => getActionIDs(0);
		const actionIDsc4 = () => getActionIDs(0, item => Number(item.cost || 0) > 0);

		const annotationVerticalLineWithLabel = (text, val) => {
			annotationArr.push({
				type: 'line',
				borderColor: problemChartColor('black', 1),
				borderWidth: 2,
				label: {
					display: true,
					backgroundColor: problemChartColor('black', 1),
					borderColor: problemChartColor('black', 1),
					content: text,
					position: 'start'
				},
				scaleID: 'x',
				value: val,
				drawTime: 'beforeDraw',
			});
		};

		const annotationSquareBackground = (tStart, tEnd) => {
			annotationArr.push({
				type: 'box',
				backgroundColor: problemChartColor('yellow', 0.2),
				borderColor: problemChartColor('yellow', 1),
				borderWidth: 1,
				xMax: tEnd,
				xMin: tStart,
				drawTime: 'beforeDraw',
			});
		};

		const annotationArrow = (tStart, tEnd) => {
			annotationArr.push({
				type: 'line',
				borderColor: problemChartColor('black', 1),
				borderDash: [6, 6],
				borderWidth: 3,
				arrowHeads: {
					end: {
						display: true,
						fill: true,
						borderDash: [],
						borderColor: problemChartColor('black', 1),
					}
				},
				xMax: tEnd,
				xMin: tStart,
				xScaleID: 'x',
				yMax: 2.5,
				yMin: 2.5,
				yScaleID: 'y'
			});
		};

		const annotationActionPoint = (data) => {
			if (!data || !data.length || !checkArr(actionLog)) return false;
			const filteredArr = actionLog.filter(item => data.includes(parseInt(item.id || 0, 10)));
			filteredArr.forEach(item => {
				annotationArr.push({
					type: 'point',
					yScaleID: 'y2',
					xValue: parseInt(item.tix || 0, 10),
					yValue: parseInt(item.totalCost || 0, 10),
					backgroundColor: 'rgba(255, 99, 132, 0.25)'
				});
			});
		};

		const annotationActionFactLabel = (data, refData) => {
			if (!data || !data.length || !checkArr(actionLog)) return false;
			data.forEach((idVal, i) => {
				actionLog.forEach(item => {
					if (item.id == idVal) {
						annotationArr.push({
							type: 'label',
							yScaleID: 'y2',
							xValue: parseInt(item.tix || 0, 10),
							yValue: parseInt(item.totalCost || 0, 10),
							backgroundColor: 'rgba(245, 245, 245, 0.5)',
							content: [refData[i]],
							font: { size: 10 }
						});
					}
				});
			});
		};

		const annotationActionTimeLabel = (data) => {
			if (!data || !data.length || !checkArr(actionLog)) return false;
			const filteredArr = actionLog.filter(item => data.includes(parseInt(item.id || 0, 10)));
			filteredArr.forEach(item => {
				annotationArr.push({
					type: 'label',
					yScaleID: 'y2',
					xValue: parseInt(item.tix || 0, 10),
					yValue: parseInt(item.totalCost || 0, 10),
					backgroundColor: 'rgba(245, 245, 245, 0.5)',
					content: [`${item.time} min`],
					font: { size: 10 }
				});
			});
		};

		const annotationActionCostLabel = (data) => {
			if (!data || !data.length || !checkArr(actionLog)) return false;
			const filteredArr = actionLog.filter(item => data.includes(parseInt(item.id || 0, 10)));
			filteredArr.forEach(item => {
				annotationArr.push({
					type: 'label',
					yScaleID: 'y2',
					xValue: parseInt(item.tix || 0, 10),
					yValue: parseInt(item.totalCost || 0, 10),
					backgroundColor: 'rgba(245, 245, 245, 0.5)',
					content: [`$${item.cost}`],
					font: { size: 10 }
				});
			});
		};

		const annotationAnalysisPoint = (data) => {
			if (!data || !data.length || !checkArr(workflow)) return false;
			const filteredArr = workflow.filter(item => data.includes(parseInt(item.id || 0, 10)));
			filteredArr.forEach(item => {
				annotationArr.push({
					type: 'point',
					yScaleID: 'y',
					xValue: parseInt(item.tix || 0, 10),
					yValue: parseInt(item.y || 0, 10),
					backgroundColor: 'rgba(255, 99, 132, 0.25)'
				});
			});
		};

		const metricById = (mid) => {
			const row = findByField(metrics, 'id', Number(mid || 0));
			return row || null;
		};

		switch (id) {
			case 1:
				annotationActionPoint(actionIDsc1());
				break;
			case 2:
				annotationActionPoint(actionIDsc2());
				break;
			case 3:
				annotationActionPoint(actionIDsc3());
				annotationActionTimeLabel(actionIDsc3());
				break;
			case 4:
				annotationActionPoint(actionIDsc4());
				annotationActionCostLabel(actionIDsc4());
				break;
			case 5:
				break;
			case 12: {
				const metric = metricById(13);
				if (!metric?.data || metric.data.timeTo == 0) break;
				annotationSquareBackground(metric.data.timeFrom, metric.data.timeTo);
				annotationArrow(metric.data.timeFrom, metric.data.timeTo);
				annotationVerticalLineWithLabel('', metric.data.timeFrom);
				annotationVerticalLineWithLabel('Time window', metric.data.timeTo);
				break;
			}
			case 22: {
				const metric = metricById(14);
				if (!metric?.data || metric.data.timeTo == 0) break;
				if (metric.data.timeFrom == metric.data.timeTo) {
					annotationVerticalLineWithLabel('', metric.data.timeFrom);
					break;
				}
				annotationSquareBackground(metric.data.timeFrom, metric.data.timeTo);
				annotationArrow(metric.data.timeFrom, metric.data.timeTo);
				annotationVerticalLineWithLabel('Start', metric.data.timeFrom);
				annotationVerticalLineWithLabel('End', metric.data.timeTo);
				break;
			}
			case 31: {
				const metric = metricById(8);
				annotationVerticalLineWithLabel('Cause', firstCauseRelatedAction);
				annotationAnalysisPoint(metric?.data || []);
				break;
			}
			case 32: {
				const metric = metricById(16);
				annotationVerticalLineWithLabel('Cause', firstCauseRelatedAction);
				annotationAnalysisPoint(metric?.data || []);
				break;
			}
			case 33: {
				const metric = metricById(15);
				if (!metric?.data || metric.data.timeTo == 0) break;
				annotationSquareBackground(metric.data.timeFrom, metric.data.timeTo);
				annotationArrow(metric.data.timeFrom, metric.data.timeTo);
				annotationVerticalLineWithLabel('', metric.data.timeFrom);
				annotationVerticalLineWithLabel('', metric.data.timeTo);
				annotationVerticalLineWithLabel('Cause', firstCauseRelatedAction);
				break;
			}
			case 41: {
				const metric = metricById(9);
				annotationActionPoint(metric?.data || []);
				annotationActionFactLabel(metric?.data || [], avoidableActionsFact());
				break;
			}
			case 42: {
				const metric = metricById(10);
				annotationActionPoint(metric?.data || []);
				break;
			}
			case 43: {
				const metric = metricById(11);
				annotationActionPoint(metric?.data || []);
				break;
			}
			case 44: {
				const metric = metricById(12);
				annotationActionPoint(metric?.data || []);
				break;
			}
			case 91: {
				const metric = metricById(17);
				annotationAnalysisPoint(metric?.data || []);
				break;
			}
			default:
				break;
		}

		return annotationArr;
	};

	const problemChartModalVideo = async (id) => {
		const csfID = {
			11: 836069978,
			12: 836438888,
			21: 840333560,
			22: 839468586,
			32: 840341476,
			91: 840320190,
		};

		if (!window.SimVideo?.buildVideoHtml) return '';
		const videoId = csfID[id];
		if (!videoId) return '';
		return window.SimVideo.buildVideoHtml('res', videoId, DELIVERY_META.language_code || 'en', true);
	};

	const problemChartModalContent = async (id) => {
		const fTerms = resultTermsMap;
		const pTerms = window.SIM_SHARED?.problem_terms || {};
		const cis = getCis();
		const actions = window.SIM_SHARED?.ci_actions || {};
		const deviations = window.SIM_SHARED?.deviations || {};
		const causeDeviations = window.SIM_SHARED?.cause_deviations || {};
		const themes = window.SIM_SHARED?.themes || {};

		const teamSymptoms = exercise.case?.symptoms || [];
		const teamFacts = exercise.case?.facts || [];
		const teamCauses = exercise.case?.causes || [];
		const refSymptoms = exercise.reference?.symptoms || [];
		const refFacts = exercise.reference?.facts || [];
		const refCauses = exercise.reference?.causes || [];
		const refActions = exercise.reference?.actions || [];
		const metrics = exercise.metrics || [];
		const theme = exercise.theme || 0;

		const themeName = mapText(themes, theme, 'Theme');
		const functions = Array.isArray(window.SIM_SHARED?.functions)
			? window.SIM_SHARED.functions.filter(item => Number(item.theme_id || 0) === Number(theme))
			: [];

		const teamPrioSymptom = teamSymptoms.find(obj => Number(obj.priority || 0) > 0);
		const refPrioSymptom = refSymptoms.find(obj => Number(obj.priority || 0) > 0);

		const iconCorrect = ' <span style="color: green;"><i class="fa-solid fa-circle-check"></i></span>';
		const iconIncorrect = ' <span style="color: red;"><i class="fa-solid fa-circle-xmark"></i></span>';

		const getInChartContent = (tItem) => {
			const map = {
				sc1: { type: 'sc', itemId: '1' },
				sc2: { type: 'sc', itemId: '2' },
				sc3: { type: 'sc', itemId: '3' },
				sc4: { type: 'sc', itemId: '4' },
				csf3A: { type: 'csf', itemId: '3A' },
				csf3C: { type: 'csf', itemId: '3C' },
				csf4A: { type: 'csf', itemId: '4A' },
				csf4B: { type: 'csf', itemId: '4B' },
				csf4C: { type: 'csf', itemId: '4C' },
				csf4D: { type: 'csf', itemId: '4D' },
			};
			const cfg = map[tItem];
			if (!cfg) return '';
			return ResultBy(cfg.type, cfg.itemId, 'text')
				.map(item => `<p>${esc(item.text_value || '')}</p>`)
				.join('');
		};

		const getDeviationFeedback = () => {
			const isDeviationOk = Number(findByField(metrics, 'id', 1)?.value || 0);
			const deviationID = teamPrioSymptom?.deviationID || 0;
			const refDeviationIDValue = refPrioSymptom?.deviationID || 0;

			const teamDeviationID = mapText(deviations, deviationID, '');
			const refDeviationID = mapText(deviations, refDeviationIDValue, '');

			if (!teamDeviationID) return `<span class="incorrect">${esc(refDeviationID)}</span>`;
			if (isDeviationOk) return esc(teamDeviationID);

			return `
				<span class="outer"><span class="inner">${esc(teamDeviationID)}</span></span>
				<span class="incorrect">${esc(refDeviationID)}</span>`;
		};

		const getFunctionFeedback = () => {
			const isFunctionOk = Number(findByField(metrics, 'id', 2)?.value || 0);

			const functionID = teamPrioSymptom?.functionID || 0;
			const refFunctionIDValue = refPrioSymptom?.functionID || 0;

			const teamFunctionID = findByField(functions, 'function_id', functionID)?.text || '';
			const refFunctionID = findByField(functions, 'function_id', refFunctionIDValue)?.text || '';

			if (!teamFunctionID) return `<span class="incorrect">${esc(refFunctionID)}</span>`;
			if (isFunctionOk) return esc(teamFunctionID);

			return `
				<span class="outer"><span class="inner">${esc(teamFunctionID)}</span></span>
				<span class="incorrect">${esc(refFunctionID)}</span>`;
		};

		const modal1Content = () => {
			if (!Array.isArray(refActions) || refActions.length === 0) return '';

			let output = `<div class="capitalize-first" style="font-weight: 500;">${esc(Problem(27, 'Corrective action'))}:</div>`;

			const filteredRefActions = refActions.filter(item => Number(item.correctiveAction || 0) > 0);
			filteredRefActions.forEach(item => {
				const ciName = getCiName(item.ciID);
				const actionText = mapText(actions, item.actionID, '');
				output += `<p>${esc(ciName)} | ${esc(actionText)}</p>`;
			});

			const filteredRefCauses = Array.isArray(refCauses)
				? refCauses.find(item => item.evidence !== null)
				: null;

			output += `<div class="capitalize-first" style="font-weight: 500;">${esc(Problem(26, 'Evidence'))}:</div>`;
			output += `<p>${esc(filteredRefCauses?.evidence || '')}</p>`;

			return output;
		};

		const modal5Content = () => {
			const capturePct = [15, 15, 20, 7, 3, 7, 3, 30];
			const metricId = [1, 2, 3, 4, 5, 6, 7];
			const tms1 = [1, 1, 8, 9, 9, 10, 10];
			const tms2 = [58, 80, 7, 6, 7, 6, 7];

			let output = `<div class="grid-sc5-details">`;

			for (let i = 0; i < metricId.length; i++) {
				const v = Number(findByField(metrics, 'id', metricId[i])?.value || 0) * capturePct[i];
				output += `
					<div>${esc(Problem(tms1[i], String(tms1[i])))} (${esc(Problem(tms2[i], String(tms2[i])))}):</div>
					<div>${v}</div>
					<div>/</div>
					<div>${capturePct[i]}</div>`;
			}

			const sc5 = Number(findByField(exercise.sc, 'id', 5)?.value || 0);
			output += `
				<div>${esc(Result(114, 'Solution logged'))}:</div>
				<div>${Number(findByField(metrics, 'id', 22)?.value || 0) ? capturePct[7] : 0}</div>
				<div>/</div>
				<div>${capturePct[7]}</div>
				<div class="capitalize-all">${esc(Result(115, 'Total'))}:</div>
				<div>${sc5}</div>
				<div>/</div>
				<div>100</div>
			</div>`;
			return output;
		};

		const modal11Content = () => {
			const isDeviationOk = Number(findByField(metrics, 'id', 1)?.value || 0);
			const isFunctionOk = Number(findByField(metrics, 'id', 2)?.value || 0);

			const teamClarify = teamPrioSymptom?.clarify || '';
			const refClarify = refPrioSymptom?.clarify || '';

			return `
				<div class="grid-feedback-symptom">
					<div class="fs-devi">
						<fieldset class="case-field">
							<legend class="case-label">
								${esc(Problem(58, 'Deviation'))} ${isDeviationOk ? iconCorrect : iconIncorrect}
							</legend>
							<div class="case-item">${getDeviationFeedback()}</div>
						</fieldset>
					</div>
					<div class="fs-func">
						<fieldset class="case-field">
							<legend class="case-label">
								${esc(Problem(80, 'Function'))} ${isFunctionOk ? iconCorrect : iconIncorrect}
							</legend>
							<div class="case-item">${getFunctionFeedback()}</div>
						</fieldset>
					</div>
					<div class="fs-tcla">
						<fieldset class="case-field">
							<legend class="case-label">${esc(Problem(38, 'Clarify'))}</legend>
							<div class="case-item">${esc(teamClarify)}</div>
						</fieldset>
					</div>
					<div class="fs-text">${esc(Problem(78, ''))}</div>
					<div class="fs-rcla">
						<fieldset class="case-field">
							<legend class="case-label">
								${esc(Problem(38, 'Clarify'))} (reference)
							</legend>
							<div class="case-item">${esc(refClarify)}</div>
						</fieldset>
					</div>
				</div>
				<br>`;
		};

		const parseWhatOkKeyValue = (kv) => {
			try {
				const o = JSON.parse(String(kv || '{}'));
				return {
					normality_id: parseInt(o.normalityID ?? o.normality_id ?? 0, 10) || 0,
					function_id: parseInt(o.functionID ?? o.function_id ?? 0, 10) || 0
				};
			} catch {
				return { normality_id: 0, function_id: 0 };
			}
		};

		const buildWhatOkText = (row) => {
			const kv = parseWhatOkKeyValue(row.keyValue || row.key_value);
			const nText = mapText(window.SIM_SHARED?.normality, kv.normality_id, '');
			const fText = getFunctionText(kv.function_id, theme);
			const clarify = String(row.text || '');
			return `${nText} ${fText}. ${clarify}`.trim();
		};

		const displayFactsQuality = () => {
			const qualityWhatOk = () => {
				const rItems = refFacts
					.filter(item => String(item.keyMeta) === 'what_ok')
					.map(item => {
						const text = buildWhatOkText(item);
						const firstSentence = String(text).split(/[.!?]/)[0].trim().replace(/\s+/g, ' ').toLowerCase();
						return {
							textFull: text,
							textFirst: firstSentence,
							deviationID: item.deviationID ?? null,
							functionID: item.functionID ?? null
						};
					});

				const tItems = teamFacts
					.filter(item => String(item.keyMeta) === 'what_ok')
					.map(item => {
						const text = buildWhatOkText(item);
						const firstSentence = String(text).split(/[.!?]/)[0].trim().replace(/\s+/g, ' ').toLowerCase();
						return {
							textFull: text,
							textFirst: firstSentence,
							deviationID: item.deviationID ?? null,
							functionID: item.functionID ?? null
						};
					});

				let output = '';

				if (checkArr(rItems)) {
					for (let i = 0; i < rItems.length; i++) {
						const r = rItems[i];
						const matched = tItems.some(t =>
							t.textFirst === r.textFirst &&
							t.deviationID === r.deviationID &&
							t.functionID === r.functionID
						);
						output += matched
							? `<div>${esc(r.textFull)}</div>`
							: `<div><span class="incorrect">${esc(r.textFull)}</span></div>`;
					}
				}

				if (checkArr(tItems)) {
					const rKeySet = new Set(rItems.map(r => `${r.textFirst}|${r.deviationID}|${r.functionID}`));
					for (let i = 0; i < tItems.length; i++) {
						const t = tItems[i];
						const key = `${t.textFirst}|${t.deviationID}|${t.functionID}`;
						if (!rKeySet.has(key)) {
							output += `<div><span class="outer"><span class="inner">${esc(t.textFull)}</span></span></div>`;
						}
					}
				}

				return output;
			};

			const qualityWhere = (fact) => {
				const tArr = teamFacts
					.filter(item => String(item.keyMeta) === fact)
					.sort((a, b) => String(a.keyValue).localeCompare(String(b.keyValue)))
					.map(item => parseInt(item.keyValue || 0, 10));

				const rArr = refFacts
					.filter(item => String(item.keyMeta) === fact)
					.sort((a, b) => String(a.keyValue).localeCompare(String(b.keyValue)))
					.map(item => parseInt(item.keyValue || 0, 10));

				let output = '';

				if (checkArr(rArr)) {
					for (let i = 0; i < rArr.length; i++) {
						const label = rArr[i] === 0
							? Problem(89, 'No comparable system')
							: `${themeName}-${rArr[i]}`;
						output += tArr.includes(rArr[i])
							? `<div>${esc(label)}</div>`
							: `<div><span class="incorrect">${esc(label)}</span></div>`;
					}
				}

				if (checkArr(tArr)) {
					for (let i = 0; i < tArr.length; i++) {
						if (!rArr.includes(tArr[i])) {
							const label = tArr[i] === 0
								? Problem(89, 'No comparable system')
								: `${themeName}-${tArr[i]}`;
							output += `<div><span class="outer"><span class="inner">${esc(label)}</span></span></div>`;
						}
					}
				}

				return output;
			};

			const qualityWhen = (fact) => {
				const tArr = teamFacts
					.filter(item => String(item.keyMeta) === fact)
					.sort((a, b) => String(a.keyValue).localeCompare(String(b.keyValue)))
					.map(item => parseInt(item.keyValue || 0, 10));

				const rArr = refFacts
					.filter(item => String(item.keyMeta) === fact)
					.sort((a, b) => String(a.keyValue).localeCompare(String(b.keyValue)))
					.map(item => parseInt(item.keyValue || 0, 10));

				let output = '';

				if (checkArr(rArr)) {
					for (let i = 0; i < rArr.length; i++) {
						const d1 = new Date(rArr[i] * 1000).toISOString().slice(0, 16).replace('T', ' ');
						output += tArr.includes(rArr[i])
							? `<div>${esc(d1)}</div>`
							: `<div><span class="incorrect">${esc(d1)}</span></div>`;
					}
				}

				if (checkArr(tArr)) {
					for (let i = 0; i < tArr.length; i++) {
						const d2 = new Date(tArr[i] * 1000).toISOString().slice(0, 16).replace('T', ' ');
						if (!rArr.includes(tArr[i])) {
							output += `<div><span class="outer"><span class="inner">${esc(d2)}</span></span></div>`;
						}
					}
				}

				return output;
			};

			const isDeviationOk = Number(findByField(metrics, 'id', 1)?.value || 0);
			const isFunctionOk = Number(findByField(metrics, 'id', 2)?.value || 0);

			return `
				<div class="grid-feedback-facts">
					<div>${esc(Problem(6, 'Not working'))}</div>
					<div>${esc(Problem(7, 'Working'))}</div>
					<fieldset class="case-field">
						<legend class="case-label">${esc(Problem(8, 'What'))} ${isDeviationOk && isFunctionOk ? iconCorrect : iconIncorrect}</legend>
						<div class="case-item">
							${getDeviationFeedback()}
							${getFunctionFeedback()}
							<div>${esc(teamPrioSymptom?.clarify || '')}</div>
						</div>
					</fieldset>
					<fieldset class="case-field">
						<legend class="case-label">${esc(Problem(8, 'What'))} ${Number(findByField(metrics, 'id', 3)?.value || 0) ? iconCorrect : iconIncorrect}</legend>
						<div class="case-item">${qualityWhatOk()}</div>
					</fieldset>
					<fieldset class="case-field">
						<legend class="case-label">${esc(Problem(9, 'Where'))} ${Number(findByField(metrics, 'id', 4)?.value || 0) ? iconCorrect : iconIncorrect}</legend>
						<div class="case-item">${qualityWhere('where_not')}</div>
					</fieldset>
					<fieldset class="case-field">
						<legend class="case-label">${esc(Problem(9, 'Where'))} ${Number(findByField(metrics, 'id', 5)?.value || 0) ? iconCorrect : iconIncorrect}</legend>
						<div class="case-item">${qualityWhere('where_ok')}</div>
					</fieldset>
					<fieldset class="case-field">
						<legend class="case-label">${esc(Problem(10, 'When'))} ${Number(findByField(metrics, 'id', 6)?.value || 0) ? iconCorrect : iconIncorrect}</legend>
						<div class="case-item">${qualityWhen('when_not')}</div>
					</fieldset>
					<fieldset class="case-field">
						<legend class="case-label">${esc(Problem(10, 'When'))} ${Number(findByField(metrics, 'id', 7)?.value || 0) ? iconCorrect : iconIncorrect}</legend>
						<div class="case-item">${qualityWhen('when_ok')}</div>
					</fieldset>
				</div>`;
		};

		const displayCausesQuality = () => {
			const actionLog = problemActionLog(exercise.log || []);
			const fcra = problemExerciseLogFirstCauseRelatedAction(actionLog);
			const ciCauses = cis.filter(item => Number(item.is_possible_cause || 0) > 0);

			const relevantCausesTimelyArr = () => {
				if (!checkArr(refCauses) || !checkArr(teamCauses)) return [];
				const arr1 = refCauses.map(item => item.ciID);
				const arr2 = teamCauses.filter(item => Number(item.tix || 0) < fcra && arr1.includes(item.ciID));
				return arr2.map(item => item.ciID);
			};

			const onListArr = relevantCausesTimelyArr();

			return refCauses.map(refCause => {
				const status = onListArr.includes(refCause.ciID) ? iconCorrect : iconIncorrect;
				const ci = ciCauses.find(item => String(item.ci_id) === String(refCause.ciID));
				const causeText = getCauseDeviationText(refCause.causeDeviationID);
				return `<p>${status} ${esc(ci?.ci_text || '')} - ${esc(causeText)}</p>`;
			}).join('');
		};

		const getModalContent = async () => {
			switch (id) {
				case 1: return getInChartContent('sc1') + modal1Content();
				case 2: return getInChartContent('sc2');
				case 3: return getInChartContent('sc3');
				case 4: return getInChartContent('sc4');
				case 5: return modal5Content();
				case 11: return modal11Content();
				case 21: return displayFactsQuality();
				case 31: return getInChartContent('csf3A');
				case 32: return displayCausesQuality();
				case 33: return getInChartContent('csf3C');
				case 41: return getInChartContent('csf4A');
				case 42: return getInChartContent('csf4B');
				case 43: return getInChartContent('csf4C');
				case 44: return getInChartContent('csf4D');
				case 12:
				case 22:
				case 91:
					return await problemChartModalVideo(id);
				default:
					return null;
			}
		};

		const content = await getModalContent();
		return { id, title: ' ', content, type: 'blue', columnClass: 'medium' };
	};

	const problemBehaviorChartShowSelected = async (id) => {
		if (!exercise.behaviorChart) return;
		const { datasets } = exercise.behaviorChart.data;
		const { plugins } = exercise.behaviorChart.options;

		// Restore default colors
		datasets[0].borderColor = '#36A2EB';
		datasets[0].backgroundColor = '#9BD0F5';
		datasets[1].borderColor = '#FF6384';
		datasets[1].backgroundColor = '#FFB1C1';

		const scRow = findByField(exercise.sc, 'id', id);
		const csfRow = findByField(exercise.csf, 'id', id);

		const measureLabel = [1, 2, 3, 4, 5].includes(id)
			? scRow?.name || ''
			: csfRow?.name || `Metric ${id}`;
		const scoreLabel = [1, 2, 3, 4, 5].includes(id)
			? scRow?.score || ''
			: csfRow?.score || '';

		const contentArr = [
			`${measureLabel}: ${scoreLabel}`,
			' ',
			`<${Result(50, 'Details')}>`
		];

		let annotationArr = [];
		const annotation = {
			type: 'label',
			position: { x: 'start', y: 3.5 },
			xValue: 60,
			yValue: 3.5,
			yScaleID: 'y',
			borderColor: problemChartColor('grey', 0.8),
			backgroundColor: problemChartColor('grey', 0.5),
			borderWidth: 2,
			borderRadius: 4,
			padding: 10,
			content: contentArr,
			textAlign: 'left',
			font: { size: 12 },
			click: async function () {
				const details = await problemChartModalContent(id);
				if (!details) return;
				simulatorShowConfirm({
					columnClass: details.columnClass,
					type: details.type,
					closeIcon: true,
					backgroundDismiss: true,
					title: details.title,
					content: details.content,
				});
			}
		};

		annotationArr.push(annotation);
		plugins.annotation.annotations = problemChartAnnotationsCreate(id, annotationArr);

		if ([1, 2, 3, 4, 41, 42, 43, 44].includes(id)) {
			datasets[0].borderColor = '#DCDCDC';
			datasets[0].backgroundColor = '#DCDCDC';
			datasets[0].order = 1;
			datasets[1].order = 0;
		}

		if ([5, 11, 12, 21, 22, 31, 91].includes(id)) {
			datasets[1].borderColor = '#DCDCDC';
			datasets[1].backgroundColor = '#DCDCDC';
			datasets[1].order = 1;
			datasets[0].order = 0;
		}

		exercise.behaviorChart.update();
	};

	const buildResultChartMarkup = () => {
		return `
			<div class="problem-result-header">
				<div class="link-text chart-info" data-id="0">${esc(Result(67, 'Chart info'))}</div>
			</div>
			<div>
				<div class="csf-btn-header">
					${esc(Result(68, 'Success criteria'))} (${esc(Result(85, 'Score'))})
					<span class="chart-info" data-id="71"><i class="fa-solid fa-circle-info"></i></span>
				</div>
				<div class="grid-result-btn-container">
					<div class="grid-feedback-buttons">
						<div class="wf-btn sc-button-deselected chart-btn" data-id="1">${esc(Result(56, 'Solved'))}</div>
						<div class="wf-btn sc-button-deselected chart-btn" data-id="2">${esc(Result(57, 'Risk'))}</div>
						<div class="wf-btn sc-button-deselected chart-btn" data-id="3">${esc(Result(58, 'Time'))}</div>
						<div class="wf-btn sc-button-deselected chart-btn" data-id="4">${esc(Result(59, 'Cost'))}</div>
						<div class="wf-btn sc-button-deselected chart-btn" data-id="5">${esc(Result(60, 'Capture'))}</div>
					</div>
				</div>
				<div id="behaviorChartContainer" class="chart-container">
					<canvas id="behaviorChart"></canvas>
				</div>
				<div class="csf-btn-header">
					${esc(Result(69, 'Critical success factors'))}
					<span class="chart-info" data-id="70"><i class="fa-solid fa-circle-info"></i></span>
				</div>
				<div class="grid-process-btn-container">
					<div class="grid-feedback-buttons">
						<div class="wf-btn csf-button-deselected chart-btn" data-id="11">1A</div>
						<div class="wf-btn csf-button-deselected chart-btn" data-id="12">1B</div>
					</div>
					<div class="grid-feedback-buttons">
						<div class="wf-btn csf-button-deselected chart-btn" data-id="21">2A</div>
						<div class="wf-btn csf-button-deselected chart-btn" data-id="22">2B</div>
					</div>
					<div class="grid-feedback-buttons">
						<div class="wf-btn csf-button-deselected chart-btn" data-id="31">3A</div>
						<div class="wf-btn csf-button-deselected chart-btn" data-id="32">3B</div>
						<div class="wf-btn csf-button-deselected chart-btn" data-id="33">3C</div>
					</div>
					<div class="grid-feedback-buttons">
						<div class="wf-btn csf-button-deselected chart-btn" data-id="41">4A</div>
						<div class="wf-btn csf-button-deselected chart-btn" data-id="42">4B</div>
						<div class="wf-btn csf-button-deselected chart-btn" data-id="43">4C</div>
						<div class="wf-btn csf-button-deselected chart-btn" data-id="44">4D</div>
					</div>
					<div class="grid-feedback-buttons">
						<div class="wf-btn csf-button-deselected chart-btn" data-id="91">5</div>
					</div>
					<div>1. ${esc(Result(105, 'Symptoms'))}</div>
					<div>2. ${esc(Result(106, 'Facts'))}</div>
					<div>3. ${esc(Result(107, 'Causes'))}</div>
					<div>4. ${esc(Result(108, 'Actions'))}</div>
					<div>All</div>
				</div>
			</div>
		`;
	};

	const renderResultChart = () => {
		const host = document.getElementById('problem_result_chart');
		if (!host) return;

		host.innerHTML = buildResultChartMarkup();
		if (typeof Chart === 'undefined') {
			dwarn('Chart.js not loaded');
			return;
		}

		exercise.behaviorChart = problemBehaviorChartCreate();
		problemFeedbackAdjustButtons();
	};

	const bindChartButtons = () => {
		$(document).off('click.resultChart', '.wf-btn');
		$(document).on('click.resultChart', '.wf-btn', function () {
			const id = parseInt($(this).attr('data-id') || '0', 10);
			if (!id || $(this).hasClass('chart-btn-inactive')) return;
			problemBehaviorChartShowSelected(id);
		});

		$(document).off('click.resultChartInfo', '.chart-info');
		$(document).on('click.resultChartInfo', '.chart-info', function () {
			const infoItems = ResultBy('chart-info', null, 'text');
			const info = infoItems.length
				? infoItems.map(item => `<p>${esc(item.text_value || '')}</p>`).join('')
				: `<p>${esc('Click a metric to see details.')}</p>`;
			simulatorShowConfirm({
				title: Result(67, 'Chart info'),
				content: info,
				type: 'blue',
				backgroundDismiss: true,
				closeIcon: true,
				columnClass: 'medium',
			});
		});
	};

	// ------------------------------------------------------------
	// 4) Page lifecycle
	// ------------------------------------------------------------
	SimulatorPage.run({
		id: 'training-instructor-problem-result',

		blocking: async () => {
			$('#display_content').html(`
				<div id="problem_result_layout">
					<div id="problem_result_chart"></div>
					<div id="problem_forms"></div>
					<div id="problem_sidebar_panels"></div>
				</div>
			`);

			if (!window.simulatorFormsStore?.createStore) {
				console.error('[problem-result] simulatorFormsStore.createStore missing');
				return;
			}

			store = window.simulatorFormsStore.createStore(EXERCISE_DATA);

			if (window.ProblemFormsLayout?.ensureLayout) {
				window.ProblemFormsLayout.ensureLayout('#problem_forms');
			}

			refreshResultTerms();
			if (debugEnabled) {
				console.log('[problem-result] terms AFTER load', {
					problem_terms: Object.keys(window.SIM_SHARED?.problem_terms || {}).length,
					problem_result_terms: window.SIM_SHARED?.problem_result_terms?.length
				});
			}
			exercise.sc = buildScList();
			exercise.csf = buildCsfList();

			await loadExerciseStaticContent();
			if (window.ProblemInfoSidebar?.prepare) {
				try { window.ProblemInfoSidebar.prepare(); } catch {}
			}

			let renderTimer = null;
			window.__PROBLEM_FORMS_ON_MODULE__ = () => {
				if (!window.__PROBLEM_FORMS_READY__) return;
				if (renderTimer) return;
				renderTimer = setTimeout(() => {
					renderTimer = null;
					const plan = Array.isArray(store.get().case.forms_plan) ? store.get().case.forms_plan : [];
					if (plan.length && window.problemFormsRegistry?.renderPlan) {
						window.problemFormsRegistry.renderPlan(store, plan);
					}
				}, 50);
			};

			await refreshState();
			await waitForFormsReady();

			const plan = Array.isArray(store.get().case.forms_plan) ? store.get().case.forms_plan : [];
			if (plan.length && window.problemFormsRegistry?.renderPlan) {
				window.problemFormsRegistry.renderPlan(store, plan);
			}
			if (plan.length && window.problemFormsRegistry?.bindPlan) {
				window.problemFormsRegistry.bindPlan({ store, scope }, plan);
			}

			renderResultChart();
			bindChartButtons();
		},

		render: () => {
			if (window.TopBarEngine?.render) window.TopBarEngine.render();
			if (window.MenuBarEngine?.render) window.MenuBarEngine.render();
		},

		bind: () => {
			if (window.HelpSidebar?.bindCloseButton) window.HelpSidebar.bindCloseButton();
			if (window.ProblemInfoSidebar?.bindCloseButton) window.ProblemInfoSidebar.bindCloseButton();

			$('#topBar').off('click.resultHome', '#topBarHome');
			$('#topBar').on('click.resultHome', '#topBarHome', function () {
				window.location.href = 'training-instructor-outline';
			});
		},

		background: async () => {
			try {
				await loadExerciseStateContent();
				if (window.ProblemInfoSidebar?.prepare) {
					try { window.ProblemInfoSidebar.prepare(); } catch {}
				}
			} catch (e) {
				dwarn('background content load failed', e);
			}
		}
	});
})();
