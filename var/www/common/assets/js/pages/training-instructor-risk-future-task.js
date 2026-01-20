/* training-instructor-risk-future-task.js */
(function () {
    'use strict';

    // -------------------------------------------------
    // Page data (injected by PHP as JSON, not as globals)
    // -------------------------------------------------
    const dataEl = document.getElementById('page-data');
    if (!dataEl) {
        throw new Error('Missing page-data JSON block');
    }

    const PAGE = JSON.parse(dataEl.textContent);

    const DEBUG        = !!PAGE.DEBUG;
    const DELIVERY     = PAGE.DELIVERY || {};
    const EXERCISE_LOG = PAGE.EXERCISE_LOG || [];

    // -------------------------------------------------
    // Runtime objects (kept local to this page)
    // -------------------------------------------------
    const EXERCISE = createRiskExerciseObject();
    const SIMULATOR = {};
    const LOGOUT = {
        counter: 0,
        minutes: 120,
    };

    // -------------------------------------------------
    // Init helpers
    // -------------------------------------------------
    const initializeDelivery = () => {
        simulatorConvertStringPropertiesToIntegers(DELIVERY);
        DELIVERY.instance = 'training';
        DELIVERY.reference = false;

        // Check for team number
        if (!instructorPacedCheckForTeam(DELIVERY)) return;

        // NOTE: This is your original behavior (redirect to setup if team not ok)
        window.location.href = 'delivery-1-setup';
    };

    const initializeExercise = () => {
        Object.assign(EXERCISE.guardClause, riskGuardClauses(DELIVERY));
        EXERCISE.log = EXERCISE_LOG;
        riskExerciseMeta(EXERCISE);
        sessionStorage.setItem('RISK_SECTION', DELIVERY.page);
    };

    const initializeSimulator = () => {
        const ok = simulatorDataCheck(DELIVERY.accessID, DELIVERY.languageCode);
        if (!ok) {
            window.location.href = 'delivery-1-outline';
            return false;
        }

        const sessionData = sessionStorage.getItem('SIMULATOR_META');
        if (!sessionData) {
            window.location.href = 'delivery-1-outline';
            return false;
        }

        Object.assign(SIMULATOR, JSON.parse(sessionData));

        SIMULATOR.RISK_QUESTION = riskQuestion(SIMULATOR);
        SIMULATOR.RISK_ANSWER_YES = riskAnswerYes(SIMULATOR);
        SIMULATOR.RISK_ANSWER_NO = riskAnswerNo(SIMULATOR);
        SIMULATOR.RISK_LEVEL_TEXT = riskLevelText(SIMULATOR);
        SIMULATOR.RISK_LEVELS = riskLevels(SIMULATOR);
        SIMULATOR.RISK_CALENDAR = {
            cDate: new Date(),
            currYear: new Date().getFullYear(),
            currMonth: new Date().getMonth(),
        };

        return true;
    };

    const updateTopBar = () => {
        // Home button
        $('#topBarHome').addClass('clickable');

        // Team
        $('#topBarArea1').html(simulatorTopBarTeamHTML(DELIVERY.team, SIMULATOR));

        // Exercise
        $('#topBarArea2').html(simulatorTopBarExerciseHTML(EXERCISE.id, SIMULATOR));

        // Step
        $('#topBarArea3').html(simulatorTopBarStepHTML(9, SIMULATOR.RISK_AVOID_METHOD));

        // Timer
        $('#topBarArea4').html(simulatorTopBarCountDownHTML(SIMULATOR));
    };

    const updateMenuButtons = () => {
        const btnItems = simulatorMenuButtonsData('exercise', [0, 2], EXERCISE.guardClause, SIMULATOR.C_MENU_BUTTONS);
        const eItemsStatus = SIMULATOR.RISK_INFO_SRC_STATUS.find(obj => obj.format == EXERCISE.format && obj.step == EXERCISE.step);
        $('#menuButtonsExercise').html(simulatorMenuButtons(btnItems, eItemsStatus));
        riskPresetHideOrShow(EXERCISE);
    };

    const logDebugInfo = () => {
        if (!DEBUG) return;
        console.log('DELIVERY', DELIVERY);
        console.log('EXERCISE', EXERCISE);
        console.log('SIMULATOR', SIMULATOR);
    };

    const handlePageContent = async () => {
        $('#main').css('margin-right', '40px');
        $('#menuBar').show();
        $('#sideBar').show();

        $('#main').html(`<div id="risk_step_title">${riskStepTitle(1, SIMULATOR)}</div>`);
        $('#main').append('<div id="risk_assessment"></div>');
        // $('#main').append('<div id="risk_analysis"></div>');
        // $('#main').append('<div id="risk_treatment"></div>');
        // $('#main').append('<div id="risk_test"></div>');
        $('#main').append('<div id="risk_footer" style="height:100px;"></div>');

        await riskFormDataRead(DELIVERY, EXERCISE);
        $('#risk_assessment').html(riskAssessmentShow(DELIVERY, EXERCISE, SIMULATOR));

        riskCountDownTimer(DELIVERY, EXERCISE, SIMULATOR);
    };

    const handlePreloadInfoSources = async () => {
        $('#sideBar').append(riskInfoSrcSideBarContainers());
        riskInfoSrcHTML(DELIVERY, EXERCISE, SIMULATOR);
    };

    const initializeEventHandlers = () => {
        // Framework-level handlers
        riskCommonEventHandler(DELIVERY, EXERCISE);
        riskInfoSrcEventHandlerMenuAndSideBar(DELIVERY, SIMULATOR, EXERCISE);

        // -----------------------------
        // Page-specific handlers
        // -----------------------------

        // Home navigation
        $('#topBar').on('click', '#topBarHome', function () {
            window.location.href = 'delivery-1-outline';
        });

        // Proceed
        $(document).on('click', '#btn_proceed', function () {
            $('#btn_proceed').removeClass('proceed-button-enabled').addClass('proceed-button-disabled');
            window.location.href = 'delivery-1-potential-problems';
        });

        // Modal focus helper
        $('#simulator_modal_common').on('transitionend', function () {
            if ($('#task_text').length) simulatorMoveCursorToEndOfDiv('task_text');
        });

        // Register risk answers
        $('#main').on('click', '.task-risk-question-answer', function () {
            const question = $(this).attr('data-question');
            const rvalue = $(this).attr('data-rvalue');

            // LOCAL
            EXERCISE.case.ta['question' + question] = parseInt(rvalue, 10);
            riskFormShow(DELIVERY, EXERCISE, SIMULATOR);

            // CENTRAL
            EXERCISE.inputData.text = EXERCISE.case.ta.text;
            EXERCISE.inputData.question1 = EXERCISE.case.ta.question1;
            EXERCISE.inputData.question2 = EXERCISE.case.ta.question2;
            EXERCISE.inputData.question3 = EXERCISE.case.ta.question3;

            riskFormCrud('Task', 'Upsert', EXERCISE);
        });

        // Open and display update task modal
        $('#main').on('click', '#task_text_view', function () {
            riskTaskModal(EXERCISE, SIMULATOR);
            showSimulatorModal('simulator_modal_common');
        });

        // Update task text in modal
        $('#simulator_modal_footer').on('click', '#update_ta', function () {
            const text = $('#task_text').text();

            // LOCAL
            EXERCISE.case.ta.text = text;
            riskFormShow(DELIVERY, EXERCISE, SIMULATOR);

            // CENTRAL
            EXERCISE.inputData.text = text;
            EXERCISE.inputData.question1 = EXERCISE.case.ta.question1;
            EXERCISE.inputData.question2 = EXERCISE.case.ta.question2;
            EXERCISE.inputData.question3 = EXERCISE.case.ta.question3;

            riskFormCrud('Task', 'Upsert', EXERCISE);

            hideSimulatorModal('simulator_modal_common');
        });
    };

    const initiatePolling = async () => {
        // SIMULATOR_POLLING is assumed to be created by simulator-polling.js
        SIMULATOR_POLLING.lastPollID = await instructorPacedLatestPollId();

        // Keep your existing mapping key (unchanged)
        simulatorPollingInitializeFunctionMappings('training-1-2-analysis');

        simulatorPollingStart(DELIVERY, EXERCISE, SIMULATOR, DEBUG);
    };

    // -------------------------------------------------
    // Main
    // -------------------------------------------------
    const main = async () => {
        try {
            initializeDelivery();
            initializeExercise();

            const simOk = initializeSimulator();
            if (!simOk) return;

            updateTopBar();
            updateMenuButtons();
            logDebugInfo();

            await handlePageContent();
            await handlePreloadInfoSources();

            initializeEventHandlers();

            await initiatePolling();
            instructorPacedActiveUserUpdate();
            simulatorLogoutUserCounter(LOGOUT);

        } catch (error) {
            console.error('Error in training-instructor-risk-future-task.js:', error);
        }
    };

    main();
})();
