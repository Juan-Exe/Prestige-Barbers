// ==================== MODAL DE RESERVAS - PRESTIGE BARBERS ====================

class ReservaModalController {
    constructor() {
        this.modal = null;
        this.calendar = null;
        this.selectedBarber = null;
        this.selectedService = null;
        this.selectedServiceType = null;
        this.selectedDate = null;
        this.selectedTime = null;
        this.additionalService = null;

        this.init();
    }

    // Inicializar el controlador del modal
    init() {
        // Crear el modal en el DOM
        this.createModal();

        // Configurar event listeners
        this.setupEventListeners();

        console.log('✅ Modal de reservas inicializado');
    }

    // Crear la estructura HTML del modal
    createModal() {
        const modalHTML = `
            <div class="reserva-modal-overlay" id="reservaModal">
                <div class="reserva-modal-content">
                    <button class="reserva-modal-close" id="closeReservaModal">&times;</button>

                    <div class="modal-res-cont">
                        <!-- Columna izquierda: Información del servicio -->
                        <div class="modal-inf-cont">
                            <div class="modal-labs-cont">
                                <label id="modalServiceType">Servicio</label>
                                <label id="modalServiceCategory">Corte de pelo</label>
                            </div>
                            <h2 id="modalServiceName">Nombre del Corte</h2>
                            <div class="modal-add-svc-cont">
                                <label>¿Agregar Servicio de barba?</label>
                                <div class="modal-add-svc-cont-btn">
                                    <button type="button" data-option="si">Si</button>
                                    <button type="button" data-option="no">No</button>
                                </div>
                            </div>
                            <div class="modal-slc-barb-cont">
                                <label>Barbero Seleccionado</label>
                                <img id="modalBarberImage" src="" alt="Barbero">
                                <p id="modalBarberName" style="margin: 5px 0; font-weight: 600;"></p>
                            </div>
                            <p>En Prestige barbers un buen corte es solo el comienzo. Recibe asesoría personalizada, escucha tu música favorita y disfruta una bebida o snack *gratis durante tu visita.</p>
                            <div class="modal-bar-ca-pri">
                                <label><span>Barrio:</span> Falso</label>
                                <label><span>Calle:</span> Falsa #123</label>
                                <label><span id="modalPrice">19.900$</span></label>
                            </div>
                        </div>

                        <!-- Columna derecha: Calendario, horas y formulario -->
                        <div class="modal-cale-hrs-frm-cont">
                            <!-- Calendario de días -->
                            <div class="modal-cale-cont">
                                <label>Día</label>
                                <div class="modal-days-slider">
                                    <button class="modal-slider-arrow" id="modalPrevDays" aria-label="Días anteriores">&lt;</button>
                                    <div class="modal-days" id="modalDaysContainer">
                                        <!-- Los días se generarán dinámicamente -->
                                    </div>
                                    <button class="modal-slider-arrow" id="modalNextDays" aria-label="Días siguientes">&gt;</button>
                                </div>
                            </div>

                            <!-- Selector de horas -->
                            <div class="modal-hours-cont">
                                <label>Hora</label>
                                <div class="modal-btn-hor-cont" id="modalHoursContainer">
                                    <button type="button" data-time="10:00">10:00AM</button>
                                    <button type="button" data-time="12:00">12:00PM</button>
                                    <button type="button" data-time="13:00">01:00PM</button>
                                    <button type="button" data-time="14:00">02:00PM</button>
                                    <button type="button" data-time="15:00">03:00PM</button>
                                </div>
                            </div>

                            <!-- Formulario de datos del cliente -->
                            <div class="modal-reg-inps">
                                <label>Nombre y Apellidos</label>
                                <input type="text" id="modalClientName" placeholder="Juan Pérez" required>
                                <label>Teléfono</label>
                                <input type="tel" id="modalClientPhone" placeholder="3001234567" required>
                                <button type="button" id="modalReserveBtn">Reservar</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Insertar modal al final del body
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        this.modal = document.getElementById('reservaModal');
    }

    // Configurar todos los event listeners
    setupEventListeners() {
        // Botón de cerrar modal
        const closeBtn = document.getElementById('closeReservaModal');
        closeBtn.addEventListener('click', () => this.closeModal());

        // Cerrar modal al hacer click fuera del contenido
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal();
            }
        });

        // Cerrar modal con tecla ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                this.closeModal();
            }
        });

        // Inicializar calendario del modal
        this.initCalendar();

        // Configurar selección de horas
        this.setupTimeSelection();

        // Configurar pregunta de servicio adicional
        this.setupAdditionalService();

        // Event listener para la selección de barberos en la página principal
        const barbersContainer = document.getElementById('barbersContainer');
        if (barbersContainer) {
            barbersContainer.addEventListener('click', (e) => {
                const selectedBarberBtn = e.target.closest('button');
                if (selectedBarberBtn) {
                    // No es necesario llamar a updateAvailableHours aquí porque
                    // la selección de barbero ya está manejada por Reserva.js
                    // y loadBarberInfo se encarga de actualizar las horas al abrir el modal.
                }
            });
        }

        // Botón principal de reserva en la página (fuera del modal)
        const mainReserveBtn = document.getElementById('reserveButton');
        if (mainReserveBtn) {
            mainReserveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openModal();
            });
        }

        // Botón de confirmar reserva (dentro del modal)
        const confirmBtn = document.getElementById('modalReserveBtn');
        confirmBtn.addEventListener('click', () => this.confirmReservation());
    }

    // Inicializar calendario dentro del modal
    initCalendar() {
        this.calendar = new ModalCalendar();
    }

    // Configurar selección de horas y actualizar dinámicamente
    async updateAvailableHours(selectedBarberBtn) {
        const hoursContainer = document.getElementById('modalHoursContainer');
        hoursContainer.innerHTML = ''; // Limpiar horas anteriores

        if (!selectedBarberBtn) {
            hoursContainer.innerHTML = '<p style="color: #666; font-size: 0.9em;">Selecciona un barbero para ver sus horas disponibles.</p>';
            return;
        }

        const barberoId = selectedBarberBtn.dataset.barberoId;
        const horarioManana = selectedBarberBtn.dataset.horarioManana;
        const horarioTarde = selectedBarberBtn.dataset.horarioTarde;

        // Obtener la fecha seleccionada
        const fechaSeleccionada = this.calendar?.getSelectedDate();

        // Obtener horas ocupadas del barbero en esa fecha
        let horasOcupadas = [];
        if (barberoId && fechaSeleccionada) {
            horasOcupadas = await this.getOccupiedHours(barberoId, fechaSeleccionada);
            console.log('🔒 [UPDATE-HOURS] Horas ocupadas en', fechaSeleccionada, ':', horasOcupadas);
        }

        const generateButtons = (range, container, isAfternoon) => {
            if (!range || range.split('-').length !== 2) return;

            let [start, end] = range.split('-');
            let startHour = parseInt(start.split(':')[0]);
            let endHour = parseInt(end.split(':')[0]);

            for (let i = startHour; i <= endHour; i++) {
                let currentHour = i;
                // Si es horario de tarde y la hora es menor a 12 (formato 1-11), se convierte a 24h
                if (isAfternoon && currentHour < 12) {
                    currentHour += 12;
                }

                const time = `${currentHour.toString().padStart(2, '0')}:00`;
                const button = document.createElement('button');
                button.type = 'button';
                button.dataset.time = time;

                let displayHour = currentHour;
                let ampm = 'AM';
                if (displayHour >= 12) {
                    ampm = 'PM';
                    if (displayHour > 12) {
                        displayHour -= 12;
                    }
                }
                if (displayHour === 0) displayHour = 12; // Para el caso de las 12 AM

                button.textContent = `${displayHour.toString().padStart(2, '0')}:00${ampm}`;

                // Verificar si esta hora está ocupada y deshabilitar el botón
                if (horasOcupadas.includes(time)) {
                    button.disabled = true;
                    button.classList.add('occupied');
                    button.title = 'Horario no disponible';
                    console.log('🔒 [UPDATE-HOURS] Hora deshabilitada:', time);
                }

                container.appendChild(button);
            }
        };

        generateButtons(horarioManana, hoursContainer, false);
        generateButtons(horarioTarde, hoursContainer, true);

        if (hoursContainer.children.length === 0) {
            hoursContainer.innerHTML = '<p style="color: #666; font-size: 0.9em;">El barbero no tiene un horario definido.</p>';
        }
    }

    // Obtener horas ocupadas del barbero en una fecha específica
    async getOccupiedHours(barberoId, fecha) {
        try {
            console.log('🔍 [GET-OCCUPIED] Consultando horas ocupadas - Barbero:', barberoId, 'Fecha:', fecha);

            const response = await fetch(`/api/reservas/barbero/${barberoId}?fecha=${fecha}`);

            if (!response.ok) {
                console.error('❌ [GET-OCCUPIED] Error al consultar reservas');
                return [];
            }

            const data = await response.json();
            console.log('📦 [GET-OCCUPIED] Respuesta del servidor:', data);

            if (!data.success || !data.reservas) {
                return [];
            }

            // Extraer solo las horas de las reservas activas (pendiente o confirmada)
            const horasOcupadas = data.reservas
                .filter(reserva => reserva.estado === 'pendiente' || reserva.estado === 'confirmada')
                .map(reserva => {
                    // Convertir hora de formato TIME de MySQL (HH:MM:SS) a HH:MM
                    const hora = reserva.hora.substring(0, 5); // "14:00:00" -> "14:00"
                    return hora;
                });

            console.log('✅ [GET-OCCUPIED] Horas ocupadas extraídas:', horasOcupadas);
            return horasOcupadas;

        } catch (error) {
            console.error('❌ [GET-OCCUPIED] Error:', error);
            return [];
        }
    }

    // Configurar selección de horas
    setupTimeSelection() {
        const hoursContainer = document.getElementById('modalHoursContainer');

        hoursContainer.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            // No permitir seleccionar botones deshabilitados
            if (button.disabled) {
                console.log('⚠️ [SELECT-TIME] Hora no disponible:', button.dataset.time);
                return;
            }

            // Deseleccionar todos
            hoursContainer.querySelectorAll('button').forEach(btn => {
                btn.classList.remove('selected');
            });

            // Seleccionar el clickeado
            button.classList.add('selected');
            this.selectedTime = button.dataset.time;

            console.log('⏰ Hora seleccionada:', this.selectedTime);
        });
    }

    // Configurar pregunta de servicio adicional
    setupAdditionalService() {
        const buttons = document.querySelectorAll('.modal-add-svc-cont-btn button');

        buttons.forEach(button => {
            button.addEventListener('click', async () => {
                const option = button.dataset.option;

                // Si hace click en el mismo botón ya seleccionado, no hacer nada
                if (button.classList.contains('selected') && option === this.additionalService) {
                    return;
                }

                // Deseleccionar todos
                buttons.forEach(btn => btn.classList.remove('selected'));

                // Seleccionar el clickeado
                button.classList.add('selected');
                this.additionalService = option;

                console.log('➕ Servicio adicional:', this.additionalService);

                // Manejar lógica según opción
                if (this.additionalService === 'no') {
                    console.log('❌ [ADDITIONAL-SERVICE] Usuario seleccionó NO - ocultando pregunta');

                    // Si dice NO, solo marcar que no quiere servicio adicional
                    this.selectedAdditionalService = null;
                    this.hideAdditionalServiceSection();

                    // Ocultar toda la pregunta de servicio adicional
                    const addSvcCont = document.querySelector('.modal-add-svc-cont');
                    if (addSvcCont) {
                        addSvcCont.style.display = 'none';
                        console.log('🙈 [ADDITIONAL-SERVICE] Pregunta de servicio adicional ocultada (display: none)');
                    } else {
                        console.log('⚠️ [ADDITIONAL-SERVICE] No se encontró .modal-add-svc-cont para ocultar');
                    }

                    // Limpiar estado de selección de servicio adicional
                    sessionStorage.removeItem('addingAdditionalService');
                    sessionStorage.removeItem('reservationContext');
                    sessionStorage.removeItem('selectedAdditionalService');
                    console.log('🧹 [ADDITIONAL-SERVICE] sessionStorage limpiado');
                } else if (this.additionalService === 'si') {
                    console.log('✅ [ADDITIONAL-SERVICE] Usuario seleccionó SÍ - redirigiendo');
                    // Redirigir a la página de cortes para seleccionar servicio adicional
                    await this.redirectToSelectAdditionalService();
                }
            });
        });

        // NO verificar aquí - se verificará después de que todo esté cargado
    }

    // Ocultar sección de servicio adicional
    hideAdditionalServiceSection() {
        const additionalSection = document.getElementById('modalAdditionalServiceSection');
        if (additionalSection) {
            additionalSection.remove();
        }
    }

    // Redirigir a la página de cortes para seleccionar servicio adicional
    async redirectToSelectAdditionalService() {
        const urlParams = new URLSearchParams(window.location.search);
        const itemId = urlParams.get('id');
        const itemType = urlParams.get('type'); // 'corte' o 'barba'

        console.log('🚀 [REDIRECT] Iniciando redirección para servicio adicional');
        console.log('📋 [REDIRECT] Servicio actual:', { id: itemId, tipo: itemType });

        // Determinar qué tipo de servicio adicional se necesita
        const additionalType = itemType === 'corte' ? 'barba' : 'corte';
        const additionalTypeLabel = itemType === 'corte' ? 'barbas' : 'corte';

        console.log('➕ [REDIRECT] Tipo de servicio adicional a seleccionar:', additionalType);

        // Mostrar modal de confirmación con Aceptar/Cancelar
        const confirmed = await window.customModal.showConfirm(
            `Redirigiendo a la sección de ${additionalTypeLabel}...<br><br>Selecciona ${itemType === 'corte' ? 'una barba' : 'un corte'} para agregar a tu reserva.`,
            'Redirigiendo'
        );

        // Si el usuario cancela, deseleccionar el botón "Sí" y marcar "No"
        if (!confirmed) {
            console.log('❌ [REDIRECT] Usuario canceló la redirección');
            const buttons = document.querySelectorAll('.modal-add-svc-cont-btn button');
            buttons.forEach(btn => btn.classList.remove('selected'));

            // Seleccionar el botón "No"
            const noButton = document.querySelector('.modal-add-svc-cont-btn button[data-option="no"]');
            if (noButton) {
                noButton.classList.add('selected');
            }

            this.additionalService = 'no';
            this.selectedAdditionalService = null;
            this.hideAdditionalServiceSection();

            // Ocultar toda la pregunta de servicio adicional
            const addSvcCont = document.querySelector('.modal-add-svc-cont');
            if (addSvcCont) {
                addSvcCont.style.display = 'none';
            }

            return;
        }

        // Si el usuario acepta, guardar el contexto y redirigir
        const barbersContainer = document.getElementById('barbersContainer');
        const selectedBarberBtn = barbersContainer?.querySelector('button.selected');

        const reservationContext = {
            serviceId: itemId,
            serviceType: itemType,
            selectedBarberId: selectedBarberBtn?.dataset.barberoId || null,
            selectedBarberName: selectedBarberBtn?.dataset.barberoNombre || selectedBarberBtn?.title || null,
            additionalServiceType: additionalType,
            timestamp: Date.now()
        };

        console.log('✅ [REDIRECT] Usuario confirmó redirección');
        console.log('💾 [REDIRECT] Guardando contexto en sessionStorage:', reservationContext);

        sessionStorage.setItem('addingAdditionalService', 'true');
        sessionStorage.setItem('reservationContext', JSON.stringify(reservationContext));

        // Redirigir a la página de cortes (sin hash)
        // El script en index.html detectará el sessionStorage y ocultará las secciones no necesarias
        console.log('🔄 [REDIRECT] Redirigiendo a:', '../Cortes/index.html');
        window.location.href = '../Cortes/index.html';
    }

    // Verificar si se regresa de la selección de servicio adicional
    checkReturnFromServiceSelection() {
        const addingAdditionalService = sessionStorage.getItem('addingAdditionalService');
        const additionalServiceData = sessionStorage.getItem('selectedAdditionalService');
        const reservationContextData = sessionStorage.getItem('reservationContext');

        console.log('🔍 [RETURN-CHECK] Verificando retorno de selección de servicio adicional');
        console.log('📦 [RETURN-CHECK] sessionStorage:', {
            addingAdditionalService,
            additionalServiceData,
            reservationContextData
        });

        if (addingAdditionalService === 'true' && additionalServiceData && reservationContextData) {
            console.log('✅ [RETURN-CHECK] Usuario está regresando con servicio adicional');

            const additionalService = JSON.parse(additionalServiceData);
            const context = JSON.parse(reservationContextData);

            console.log('📋 [RETURN-CHECK] Servicio adicional seleccionado:', additionalService);
            console.log('📋 [RETURN-CHECK] Contexto de reserva:', context);

            // Verificar que el usuario regresó al servicio correcto
            const urlParams = new URLSearchParams(window.location.search);
            const currentServiceId = urlParams.get('id');
            const currentServiceType = urlParams.get('type');

            console.log('🔍 [RETURN-CHECK] Verificando coincidencia de servicio:', {
                current: { id: currentServiceId, type: currentServiceType },
                expected: { id: context.serviceId, type: context.serviceType }
            });

            if (currentServiceId === context.serviceId && currentServiceType === context.serviceType) {
                console.log('✅ [RETURN-CHECK] Coincidencia correcta - restaurando estado');

                // Restaurar selección de servicio adicional
                this.selectedAdditionalService = additionalService;
                this.additionalService = 'si';

                // Ocultar la pregunta de servicio adicional
                const addSvcCont = document.querySelector('.modal-add-svc-cont');
                if (addSvcCont) {
                    addSvcCont.style.display = 'none';
                    console.log('🙈 [RETURN-CHECK] Pregunta de servicio adicional ocultada');
                }

                // Mostrar información del servicio adicional
                console.log('🖼️ [RETURN-CHECK] Mostrando información del servicio adicional');
                this.showAdditionalServiceInfo(additionalService);

                // Validar si el barbero seleccionado puede hacer ambos servicios
                console.log('🔍 [RETURN-CHECK] Validando barbero para ambos servicios');
                this.validateBarberForAdditionalService(context);

                // NO limpiar sessionStorage aquí - se limpiará después de abrir el modal
                // para que cargarBarberosEspecializados() pueda leer selectedAdditionalService

                // IMPORTANTE: Esperar a que restaurarBarberoSeleccionado() termine
                // Esto se ejecuta automáticamente en Reserva.js, pero tiene un setTimeout de 100ms
                // Necesitamos esperar muy poco para que la selección esté lista
                setTimeout(() => {
                    console.log('🔓 [RETURN-CHECK] Abriendo modal automáticamente (después de restaurar barbero)');
                    this.openModal();

                    // Limpiar sessionStorage DESPUÉS de abrir el modal
                    // Esto asegura que cargarBarberosEspecializados() ya se ejecutó
                    setTimeout(() => {
                        sessionStorage.removeItem('addingAdditionalService');
                        sessionStorage.removeItem('selectedAdditionalService');
                        sessionStorage.removeItem('reservationContext');
                        console.log('🧹 [RETURN-CHECK] sessionStorage limpiado (después de abrir modal)');
                    }, 200);
                }, 50); // Reducido a 50ms para apertura inmediata
            } else {
                console.log('❌ [RETURN-CHECK] No hay coincidencia - ignorando y limpiando sessionStorage');
                // Limpiar sessionStorage si no hay coincidencia (usuario navegó a otro servicio)
                sessionStorage.removeItem('addingAdditionalService');
                sessionStorage.removeItem('selectedAdditionalService');
                sessionStorage.removeItem('reservationContext');
                console.log('✅ [RETURN-CHECK] sessionStorage limpiado por falta de coincidencia');
            }
        } else {
            console.log('ℹ️ [RETURN-CHECK] No hay estado de servicio adicional para restaurar');

            // Si hay datos parciales en sessionStorage, limpiarlos para evitar confusión
            if (addingAdditionalService || additionalServiceData || reservationContextData) {
                console.log('🧹 [RETURN-CHECK] Limpiando datos parciales de sessionStorage');
                sessionStorage.removeItem('addingAdditionalService');
                sessionStorage.removeItem('selectedAdditionalService');
                sessionStorage.removeItem('reservationContext');
                console.log('✅ [RETURN-CHECK] sessionStorage limpiado');
            }
        }
    }

    // Validar si el barbero seleccionado puede hacer ambos servicios
    async validateBarberForAdditionalService(context) {
        console.log('🔍 [VALIDATE-BARBER] Iniciando validación de barbero para servicio adicional');
        console.log('📋 [VALIDATE-BARBER] Contexto recibido:', context);

        if (!context.selectedBarberId) {
            // No hay barbero seleccionado, mostrar selector de barberos tipo "Ambos" en el modal
            console.log('⚠️ [VALIDATE-BARBER] No hay barbero previo seleccionado');
            console.log('🎯 [VALIDATE-BARBER] Mostrando selector de barberos tipo "Ambos" en modal');
            await this.showBarberSelectorInModal();
            return;
        }

        try {
            console.log('🌐 [VALIDATE-BARBER] Consultando API para barbero ID:', context.selectedBarberId);
            // Obtener información del barbero seleccionado
            const response = await fetch(`/api/barberos/${context.selectedBarberId}`);
            if (!response.ok) throw new Error('Error al obtener barbero');

            const barbero = await response.json();

            console.log('✅ [VALIDATE-BARBER] Barbero obtenido de API:', barbero);
            console.log('🔍 [VALIDATE-BARBER] Tipo de barbero:', barbero.tipo);

            // Verificar si el barbero puede hacer ambos servicios
            // Solo los barberos tipo "Ambos" pueden hacer corte + barba
            if (barbero.tipo !== 'Ambos') {
                // El barbero NO puede hacer ambos servicios, deseleccionarlo
                console.log(`❌ [VALIDATE-BARBER] Barbero "${barbero.nombre}" (${barbero.tipo}) NO puede hacer ambos servicios`);
                console.log('🗑️ [VALIDATE-BARBER] Deseleccionando barbero de la interfaz');

                // Deseleccionar el barbero en la interfaz de la página
                const barbersContainer = document.getElementById('barbersContainer');
                if (barbersContainer) {
                    const selectedButton = barbersContainer.querySelector('button.selected');
                    if (selectedButton) {
                        selectedButton.classList.remove('selected');
                        console.log('✅ [VALIDATE-BARBER] Botón de barbero deseleccionado');
                    }
                }

                // Limpiar barbero seleccionado
                this.selectedBarber = null;
                console.log('🧹 [VALIDATE-BARBER] this.selectedBarber = null');

                console.log('🎯 [VALIDATE-BARBER] Mostrando selector de barberos tipo "Ambos"');

                // Mostrar selector de barberos tipo "Ambos" en el modal
                await this.showBarberSelectorInModal();
            } else {
                console.log(`✅ [VALIDATE-BARBER] Barbero "${barbero.nombre}" SÍ puede hacer ambos servicios`);
                console.log('✨ [VALIDATE-BARBER] Se mantiene seleccionado - loadBarberInfo() lo mostrará');
                // El barbero está bien seleccionado, asegurarse de que se muestre correctamente en el modal
                // NO mostrar el selector, dejar que loadBarberInfo() haga su trabajo
            }
        } catch (error) {
            console.error('❌ [VALIDATE-BARBER] Error al validar barbero:', error);
        }
    }

    // Mostrar selector de barberos tipo "Ambos" en el modal
    async showBarberSelectorInModal() {
        try {
            console.log('🌐 [BARBER-SELECTOR] Consultando API /api/barberos');
            // Obtener todos los barberos
            const response = await fetch('/api/barberos');
            if (!response.ok) throw new Error('Error al cargar barberos');

            const todosBarberos = await response.json();
            console.log('✅ [BARBER-SELECTOR] Barberos obtenidos:', todosBarberos);

            // Filtrar solo barberos tipo "Ambos"
            const barberosAmbos = todosBarberos.filter(barbero => barbero.tipo === 'Ambos');
            console.log('🔍 [BARBER-SELECTOR] Barberos tipo "Ambos" filtrados:', barberosAmbos);

            if (barberosAmbos.length === 0) {
                console.error('❌ [BARBER-SELECTOR] No hay barberos tipo "Ambos" disponibles');
                // Sin este aviso el modal se quedaba en "Ningun barbero
                // seleccionado" y sin selector, sin explicar por que.
                const nombreEl = document.getElementById('modalBarberName');
                if (nombreEl) {
                    nombreEl.textContent = 'Ningún profesional atiende corte y barba a la vez. Quita el servicio adicional para continuar.';
                    nombreEl.style.display = 'block';
                    nombreEl.style.color = '#b00';
                    nombreEl.style.fontWeight = '500';
                }
                return;
            }

            console.log('✅ [BARBER-SELECTOR] Barberos tipo "Ambos" encontrados:', barberosAmbos.length);

            // Obtener el contenedor del barbero en el modal
            const barberContainer = document.querySelector('.modal-slc-barb-cont');
            if (!barberContainer) {
                console.error('❌ [BARBER-SELECTOR] No se encontró .modal-slc-barb-cont');
                return;
            }
            console.log('✅ [BARBER-SELECTOR] Contenedor de barbero encontrado');

            // Limpiar el contenedor y crear el selector
            const modalBarberImage = document.getElementById('modalBarberImage');
            const modalBarberName = document.getElementById('modalBarberName');

            // Ocultar imagen y nombre
            if (modalBarberImage) {
                modalBarberImage.style.display = 'none';
                console.log('🙈 [BARBER-SELECTOR] Imagen de barbero ocultada');
            }
            if (modalBarberName) {
                modalBarberName.style.display = 'none';
                console.log('🙈 [BARBER-SELECTOR] Nombre de barbero ocultado');
            }

            // Crear contenedor de barberos si no existe
            let barberSelector = document.getElementById('modalBarberSelector');
            if (!barberSelector) {
                barberSelector = document.createElement('div');
                barberSelector.id = 'modalBarberSelector';
                barberSelector.style.cssText = 'display: flex; flex-wrap: wrap; gap: 20px; margin-top: 15px; align-items: center; justify-content: center;';
                barberContainer.appendChild(barberSelector);
                console.log('✅ [BARBER-SELECTOR] Contenedor de selector creado');
            } else {
                console.log('ℹ️ [BARBER-SELECTOR] Contenedor de selector ya existe');
            }

            // Limpiar selector
            barberSelector.innerHTML = '';
            console.log('🧹 [BARBER-SELECTOR] Selector limpiado');

            // Actualizar el label ANTES de crear los botones
            const barberLabel = barberContainer.querySelector('label');
            if (barberLabel) {
                barberLabel.textContent = 'Seleccionar Peluquero Barbero';
                console.log('✅ [BARBER-SELECTOR] Label actualizado');
            }

            // Dar estilo de grid al selector para que se vea como la página de reserva
            barberSelector.className = 'barb-btn-cont';
            barberSelector.style.cssText = 'display: flex; flex-wrap: wrap; gap: 20px; margin-top: 15px; align-items: center; justify-content: center;';

            // Renderizar barberos con estilo circular
            console.log('🖼️ [BARBER-SELECTOR] Renderizando barberos circulares');
            barberosAmbos.forEach((barbero, index) => {
                console.log(`🎨 [BARBER-SELECTOR] Creando botón para barbero ${index + 1}:`, barbero);
                const button = document.createElement('button');
                button.type = 'button';
                // NO agregar className - dejar que el CSS de .barb-btn-cont button lo maneje
                button.dataset.barberoId = barbero.id;
                button.dataset.barberoNombre = barbero.nombre;
                button.dataset.barberoImagen = barbero.imagen;
                button.dataset.horarioManana = barbero.horario_manana || '';
                button.dataset.horarioTarde = barbero.horario_tarde || '';
                button.title = barbero.nombre;
                // IMPORTANTE: Usar backgroundImage en el style para que el CSS tome el resto
                button.style.backgroundImage = `url(${barbero.imagen})`;

                console.log(`✅ [BARBER-SELECTOR] Botón ${index + 1} creado con imagen:`, barbero.imagen);
                console.log(`📅 [BARBER-SELECTOR] Horarios - Mañana: ${barbero.horario_manana}, Tarde: ${barbero.horario_tarde}`);

                console.log(`🎯 [BARBER-SELECTOR] Agregando evento click al botón ${index + 1}`);
                button.addEventListener('click', () => {
                    console.log('🖱️ [BARBER-SELECTOR] ========== CLICK DETECTADO ==========');
                    console.log('👆 [BARBER-SELECTOR] Click en barbero:', barbero.nombre);
                    console.log('📋 [BARBER-SELECTOR] Datos del barbero:', barbero);

                    // Deseleccionar todos
                    barberSelector.querySelectorAll('button').forEach(btn => {
                        btn.classList.remove('selected');
                    });
                    console.log('🧹 [BARBER-SELECTOR] Todos los barberos deseleccionados');

                    // Seleccionar este (el CSS de .barb-btn-cont button.selected maneja el estilo)
                    button.classList.add('selected');
                    console.log('✅ [BARBER-SELECTOR] Barbero seleccionado visualmente');

                    // Actualizar barbero seleccionado
                    this.selectedBarber = {
                        id: barbero.id,
                        nombre: barbero.nombre,
                        imagen: barbero.imagen
                    };
                    console.log('💾 [BARBER-SELECTOR] this.selectedBarber actualizado:', this.selectedBarber);

                    // Seleccionar el barbero en la página también
                    const barbersContainer = document.getElementById('barbersContainer');
                    if (barbersContainer) {
                        const pageButton = barbersContainer.querySelector(`button[data-barbero-id="${barbero.id}"]`);
                        if (pageButton) {
                            barbersContainer.querySelectorAll('button').forEach(btn => btn.classList.remove('selected'));
                            pageButton.classList.add('selected');
                            console.log('✅ [BARBER-SELECTOR] Barbero también seleccionado en la página');

                            // IMPORTANTE: Actualizar horarios disponibles con el barbero seleccionado
                            console.log('🕐 [BARBER-SELECTOR] Actualizando horarios disponibles');
                            this.updateAvailableHours(pageButton);

                            // Actualizar la UI del modal para mostrar el barbero seleccionado
                            console.log('🖼️ [BARBER-SELECTOR] Actualizando UI del modal');
                            const modalBarberImage = document.getElementById('modalBarberImage');
                            const modalBarberName = document.getElementById('modalBarberName');
                            const modalBarberSelector = document.getElementById('modalBarberSelector');

                            if (modalBarberImage) {
                                modalBarberImage.src = barbero.imagen;
                                modalBarberImage.style.display = 'block';
                                modalBarberImage.alt = barbero.nombre;
                                console.log('✅ [BARBER-SELECTOR] Imagen del barbero actualizada en modal');
                            }

                            if (modalBarberName) {
                                modalBarberName.textContent = barbero.nombre;
                                modalBarberName.style.fontWeight = '600';
                                modalBarberName.style.color = '#1b1b1b';
                                modalBarberName.style.display = 'block';
                                console.log('✅ [BARBER-SELECTOR] Nombre del barbero actualizado en modal');
                            }

                            // Ocultar el selector de barberos
                            if (modalBarberSelector) {
                                modalBarberSelector.style.display = 'none';
                                console.log('🙈 [BARBER-SELECTOR] Selector de barberos ocultado');
                            }

                            // Actualizar el label
                            const barberLabel = document.querySelector('.modal-slc-barb-cont label');
                            if (barberLabel) {
                                barberLabel.textContent = 'Barbero Seleccionado';
                                console.log('✅ [BARBER-SELECTOR] Label actualizado');
                            }

                        } else {
                            console.log('⚠️ [BARBER-SELECTOR] Barbero no encontrado en la página (botón)');
                        }
                    } else {
                        console.log('⚠️ [BARBER-SELECTOR] No se encontró barbersContainer en la página');
                    }

                    console.log('✅ [BARBER-SELECTOR] Selección completada y UI actualizada');
                });

                barberSelector.appendChild(button);
                console.log(`✅ [BARBER-SELECTOR] Botón ${index + 1} agregado al DOM`);
                console.log(`🔍 [BARBER-SELECTOR] Botón en DOM:`, barberSelector.contains(button));
            });
            console.log('✅ [BARBER-SELECTOR] Todos los botones renderizados');
            console.log('🔍 [BARBER-SELECTOR] Total de botones en selector:', barberSelector.children.length);

        } catch (error) {
            console.error('❌ [BARBER-SELECTOR] Error al mostrar selector de barberos:', error);
        }
    }

    // Mostrar información del servicio adicional seleccionado
    showAdditionalServiceInfo(additionalService) {
        // Remover sección previa si existe
        this.hideAdditionalServiceSection();

        // NO ocultar el h2 original, dejarlo como está
        // Solo agregar el servicio adicional debajo

        // Encontrar el h2 del modal para insertar después de él
        const modalServiceName = document.getElementById('modalServiceName');
        if (!modalServiceName) return;

        // Reducir el margen inferior del h2 para que queden más pegados
        modalServiceName.style.marginBottom = '5px';

        // Crear sección solo con el servicio adicional y el botón, centrado
        const section = document.createElement('div');
        section.id = 'modalAdditionalServiceSection';
        section.style.cssText = 'margin-top: 0; margin-bottom: 15px; text-align: center; width: 100%; display: block;';
        section.innerHTML = `
            <p style="margin: 0 auto 8px auto; font-size: 1em; font-weight: 600; color: #1b1b1b; font-family: 'Montserrat', sans-serif; text-transform: uppercase; text-align: center; display: block; width: 100%;">+ ${additionalService.nombre}</p>
            <button type="button" id="removeAdditionalService" style="margin: 15px auto 0 auto; padding: 10px 20px; background: white; color: #1b1b1b; border: 3px solid #1b1b1b; cursor: pointer; font-family: 'Montserrat', sans-serif; transition: all 0.3s ease; font-weight: 500; display: block;">
                Quitar servicio
            </button>
        `;

        // Insertar después del h2
        modalServiceName.parentNode.insertBefore(section, modalServiceName.nextSibling);

        // Agregar event listener al botón de quitar
        const removeBtn = document.getElementById('removeAdditionalService');
        if (removeBtn) {
            // Agregar efectos hover
            removeBtn.addEventListener('mouseenter', () => {
                removeBtn.style.background = '#1b1b1b';
                removeBtn.style.color = 'white';
            });

            removeBtn.addEventListener('mouseleave', () => {
                removeBtn.style.background = 'white';
                removeBtn.style.color = '#1b1b1b';
            });

            removeBtn.addEventListener('click', () => {
                this.selectedAdditionalService = null;
                this.additionalService = null;
                this.hideAdditionalServiceSection();

                // Actualizar precio (quitar servicio adicional)
                this.updateTotalPrice();

                // Restaurar el margen inferior del h2
                const modalServiceName = document.getElementById('modalServiceName');
                if (modalServiceName) {
                    modalServiceName.style.marginBottom = '';
                }

                // Mostrar de nuevo la pregunta de servicio adicional
                const addSvcCont = document.querySelector('.modal-add-svc-cont');
                if (addSvcCont) {
                    addSvcCont.style.display = 'block';
                }

                // Deseleccionar todos los botones
                document.querySelectorAll('.modal-add-svc-cont-btn button').forEach(btn => {
                    btn.classList.remove('selected');
                });

                // Recargar barberos según el servicio principal
                const urlParams = new URLSearchParams(window.location.search);
                const itemId = urlParams.get('id');
                const itemType = urlParams.get('type');

                // Cerrar modal, recargar y abrir de nuevo
                this.closeModal();
                setTimeout(async () => {
                    await cargarBarberosEspecializados(itemId, itemType);
                    restaurarBarberoSeleccionado();
                    this.openModal();
                }, 100);
            });
        }

        // Actualizar el precio total (servicio principal + adicional)
        this.updateTotalPrice();
    }

    // Abrir el modal con animación
    async openModal() {
        console.log('🔍 [OPEN-MODAL] Iniciando apertura del modal');

        // Verificar si hay sesión activa
        if (!this.checkUserSession()) {
            console.log('❌ [OPEN-MODAL] No hay sesión activa - bloqueando apertura');
            return; // No abrir el modal si no hay sesión
        }

        // Verificar si hay servicio adicional (en ese caso, el modal mostrará selector de barberos)
        const hasAdditionalService = this.selectedAdditionalService !== null && this.selectedAdditionalService !== undefined;
        console.log('🔍 [OPEN-MODAL] ¿Hay servicio adicional?:', hasAdditionalService);

        // Verificar si hay barbero seleccionado
        const barbersContainer = document.getElementById('barbersContainer');
        const selectedBarberBtn = barbersContainer?.querySelector('button.selected');

        console.log('🔍 [OPEN-MODAL] Verificando barbero seleccionado:', !!selectedBarberBtn);

        // Solo validar barbero si NO hay servicio adicional
        // Cuando hay servicio adicional, el modal mostrará un selector de barberos tipo "Ambos"
        if (!selectedBarberBtn && !hasAdditionalService) {
            console.log('⚠️ [OPEN-MODAL] No hay barbero seleccionado y no hay servicio adicional - mostrando alerta');

            // Obtener el tipo de servicio para personalizar el mensaje
            const urlParams = new URLSearchParams(window.location.search);
            const itemType = urlParams.get('type'); // 'corte' o 'barba'

            let profesionalTipo = 'peluquero o barbero';
            if (itemType === 'corte') {
                profesionalTipo = 'peluquero';
            } else if (itemType === 'barba') {
                profesionalTipo = 'barbero';
            }

            console.log('📋 [OPEN-MODAL] Tipo de profesional:', profesionalTipo);

            // Mostrar modal de alerta personalizado
            if (window.customModal) {
                await window.customModal.showAlert(
                    `Debes seleccionar un <strong>${profesionalTipo}</strong> disponible antes de hacer una reserva.<br><br>Por favor selecciona uno de los profesionales disponibles y vuelve a intentar.`,
                    'Selecciona un Profesional'
                );
            } else {
                // Fallback si no existe customModal
                alert(`Debes seleccionar un ${profesionalTipo} disponible antes de hacer una reserva.\n\nPor favor selecciona uno de los profesionales disponibles y vuelve a intentar.`);
            }

            console.log('✅ [OPEN-MODAL] Alerta mostrada - apertura bloqueada');
            return; // No abrir el modal si no hay barbero seleccionado
        }

        if (hasAdditionalService && !selectedBarberBtn) {
            console.log('ℹ️ [OPEN-MODAL] Hay servicio adicional pero no hay barbero - el modal mostrará selector de barberos tipo "Ambos"');
        } else {
            console.log('✅ [OPEN-MODAL] Barbero seleccionado - continuando apertura');
        }

        // Obtener información del servicio y barbero seleccionado
        this.loadServiceInfo();
        this.loadBarberInfo();

        // Cargar información del usuario en el formulario
        this.loadUserDataToForm();

        // Mostrar modal
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevenir scroll del body

        console.log('🔓 [OPEN-MODAL] Modal abierto exitosamente');
    }

    // Cargar datos del usuario en el formulario
    loadUserDataToForm() {
        console.log('📝 [LOAD-USER-DATA] Cargando datos del usuario al formulario');

        const userData = localStorage.getItem('user_data');

        if (!userData) {
            console.log('⚠️ [LOAD-USER-DATA] No hay datos de usuario en localStorage');
            return;
        }

        try {
            const user = JSON.parse(userData);
            console.log('👤 [LOAD-USER-DATA] Datos de usuario:', user);

            // Autocompletar campo de nombre (ID correcto: modalClientName)
            const nameInput = document.getElementById('modalClientName');
            if (nameInput && user.nombre_completo) {
                nameInput.value = user.nombre_completo;
                console.log('✅ [LOAD-USER-DATA] Nombre autocompletado:', user.nombre_completo);
            } else if (!nameInput) {
                console.log('⚠️ [LOAD-USER-DATA] Campo de nombre no encontrado (ID: modalClientName)');
            } else {
                console.log('⚠️ [LOAD-USER-DATA] Usuario sin nombre en localStorage');
            }

            // Autocompletar el teléfono guardado en el perfil (el usuario puede cambiarlo)
            const phoneInput = document.getElementById('modalClientPhone');
            if (phoneInput && user.telefono) {
                phoneInput.value = user.telefono;
                console.log('✅ [LOAD-USER-DATA] Teléfono autocompletado desde el perfil');
            } else if (phoneInput) {
                console.log('ℹ️ [LOAD-USER-DATA] El usuario no tiene teléfono guardado');
            }

        } catch (error) {
            console.error('❌ [LOAD-USER-DATA] Error al parsear datos de usuario:', error);
        }
    }

    // Verificar si hay sesión activa
    checkUserSession() {
        // IMPORTANTE: Usar las mismas claves que auth-modal.js
        const token = localStorage.getItem('auth_token');
        const userData = localStorage.getItem('user_data');

        if (!token || !userData) {
            // No hay sesión activa, mostrar modal personalizado
            this.showLoginRequiredModal();

            console.log('❌ Sesión no activa - Modal de reserva bloqueado');
            return false;
        }

        try {
            const user = JSON.parse(userData);
            console.log('✅ Sesión activa - Usuario:', user.nombre_completo);
            return true;
        } catch (error) {
            console.error('Error al parsear datos de usuario:', error);
            this.showLoginRequiredModal();
            return false;
        }
    }

    // Mostrar modal personalizado de inicio de sesión requerido
    async showLoginRequiredModal() {
        if (window.customModal) {
            await window.customModal.showAlert(
                'Debes iniciar sesión para hacer una reserva.<br><br>Por favor inicia sesión o regístrate para continuar.',
                'Inicio de Sesión Requerido'
            );

            // Abrir modal de autenticación si existe
            const authModal = document.getElementById('authModal');
            if (authModal) {
                authModal.classList.add('active');
            }
        } else {
            // Fallback si no existe customModal
            alert('Debes iniciar sesión para hacer una reserva.\n\nPor favor inicia sesión o regístrate para continuar.');

            const authModal = document.getElementById('authModal');
            if (authModal) {
                authModal.classList.add('active');
            }
        }
    }

    // Cerrar el modal con animación
    closeModal() {
        console.log('🔒 [CLOSE-MODAL] Iniciando cierre del modal');

        this.modal.classList.remove('active');
        document.body.style.overflow = ''; // Restaurar scroll

        // Resetear el estado de la pregunta de servicio adicional
        console.log('🔄 [CLOSE-MODAL] Reseteando estado de servicio adicional');

        // Mostrar de nuevo la pregunta de servicio adicional
        const addSvcCont = document.querySelector('.modal-add-svc-cont');
        if (addSvcCont) {
            addSvcCont.style.display = 'flex';
            console.log('✅ [CLOSE-MODAL] Pregunta de servicio adicional mostrada');
        } else {
            console.log('⚠️ [CLOSE-MODAL] No se encontró .modal-add-svc-cont');
        }

        // Deseleccionar todos los botones de servicio adicional
        const addSvcButtons = document.querySelectorAll('.modal-add-svc-cont-btn button');
        addSvcButtons.forEach(btn => {
            btn.classList.remove('selected');
        });
        console.log('🧹 [CLOSE-MODAL] Botones de servicio adicional deseleccionados');

        // Limpiar variables de estado
        this.additionalService = null;
        this.selectedAdditionalService = null;
        console.log('🧹 [CLOSE-MODAL] Variables de estado limpiadas');

        // Remover sección de servicio adicional si existe
        const additionalSection = document.getElementById('modalAdditionalServiceSection');
        if (additionalSection) {
            additionalSection.remove();
            console.log('🗑️ [CLOSE-MODAL] Sección de servicio adicional removida');
        } else {
            console.log('ℹ️ [CLOSE-MODAL] No había sección de servicio adicional para remover');
        }

        // Restaurar margen del h2
        const modalServiceName = document.getElementById('modalServiceName');
        if (modalServiceName) {
            modalServiceName.style.marginBottom = '';
            console.log('✅ [CLOSE-MODAL] Margen del h2 restaurado');
        }

        console.log('✅ [CLOSE-MODAL] Modal cerrado y reseteado completamente');
    }

    // Cargar información del servicio en el modal
    async loadServiceInfo() {
        const urlParams = new URLSearchParams(window.location.search);
        const itemId = urlParams.get('id');
        const itemType = urlParams.get('type'); // 'corte' o 'barba'

        const serviceName = document.getElementById('serviceName')?.textContent || 'Servicio';
        const serviceType = document.getElementById('serviceType')?.textContent || 'Corte';

        document.getElementById('modalServiceName').textContent = serviceName;
        document.getElementById('modalServiceCategory').textContent = serviceType;
        document.getElementById('modalServiceType').textContent = 'Servicio';

        // Actualizar pregunta de servicio adicional dinámicamente
        const additionalServiceLabel = document.querySelector('.modal-add-svc-cont > label');
        if (additionalServiceLabel) {
            if (itemType === 'corte') {
                additionalServiceLabel.textContent = '¿Agregar Servicio de barba?';
            } else if (itemType === 'barba') {
                additionalServiceLabel.textContent = '¿Agregar Corte de pelo?';
            } else {
                additionalServiceLabel.textContent = '¿Agregar Servicio adicional?';
            }
        }

        // Obtener el precio del servicio principal desde la API
        try {
            const endpoint = itemType === 'corte' ? `/api/cortes_admin/${itemId}` : `/api/barbas_admin/${itemId}`;
            const response = await fetch(endpoint);

            if (response.ok) {
                const servicio = await response.json();
                this.selectedServicePrice = parseFloat(servicio.precio) || 0;
                console.log('💰 Precio del servicio principal:', this.selectedServicePrice);

                // Actualizar el precio en el modal
                this.updateTotalPrice();
            }
        } catch (error) {
            console.error('Error al obtener precio del servicio:', error);
            this.selectedServicePrice = 0;
        }

        this.selectedService = serviceName;
        this.selectedServiceType = itemType;

        console.log('📋 Servicio cargado:', serviceName, '| Tipo:', itemType);
    }

    // Actualizar precio total (servicio principal + servicio adicional)
    async updateTotalPrice() {
        let totalPrice = this.selectedServicePrice || 0;
        console.log('💰 [PRICE] Precio base del servicio:', totalPrice);

        // Si hay servicio adicional, obtener su precio y sumarlo
        if (this.selectedAdditionalService && this.selectedAdditionalService.id) {
            try {
                const additionalType = this.selectedAdditionalService.tipo;
                const additionalId = this.selectedAdditionalService.id;
                const endpoint = additionalType === 'corte' ? `/api/cortes_admin/${additionalId}` : `/api/barbas_admin/${additionalId}`;

                console.log('🌐 [PRICE] Consultando precio del servicio adicional:', endpoint);

                const response = await fetch(endpoint);
                if (response.ok) {
                    const servicioAdicional = await response.json();
                    const precioAdicional = parseFloat(servicioAdicional.precio) || 0;
                    totalPrice += precioAdicional;

                    console.log('💰 [PRICE] Precio servicio adicional:', precioAdicional);
                    console.log('💰 [PRICE] Precio TOTAL:', totalPrice);
                }
            } catch (error) {
                console.error('❌ [PRICE] Error al obtener precio del servicio adicional:', error);
            }
        } else {
            console.log('ℹ️ [PRICE] No hay servicio adicional');
        }

        // Formatear precio con separador de miles y mostrar
        const precioFormateado = totalPrice.toLocaleString('es-CO', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });

        const modalPriceElement = document.getElementById('modalPrice');
        if (modalPriceElement) {
            modalPriceElement.textContent = `${precioFormateado}$`;
            console.log('✅ [PRICE] Precio actualizado en modal:', precioFormateado + '$');
        }
    }

    // Cargar información del barbero seleccionado
    loadBarberInfo() {
        console.log('🔍 [LOAD-BARBER] Cargando información del barbero');
        const barbersContainer = document.getElementById('barbersContainer');
        const selectedBarberBtn = barbersContainer?.querySelector('button.selected');

        // Actualizar las horas disponibles en el modal
        this.updateAvailableHours(selectedBarberBtn);

        console.log('📋 [LOAD-BARBER] Botón seleccionado encontrado:', !!selectedBarberBtn);

        const modalBarberImage = document.getElementById('modalBarberImage');
        const modalBarberName = document.getElementById('modalBarberName');
        const barberContainer = document.querySelector('.modal-slc-barb-cont');

        // Verificar si existe el selector de barberos en el modal
        const modalBarberSelector = document.getElementById('modalBarberSelector');

        if (!selectedBarberBtn) {
            // Si no hay barbero seleccionado en la página
            console.log('⚠️ [LOAD-BARBER] No hay barbero seleccionado en la página');

            // Verificar si hay un selector de barberos en el modal
            if (modalBarberSelector && modalBarberSelector.children.length > 0) {
                // Hay un selector en el modal - verificar si hay alguno seleccionado
                const selectedInModal = modalBarberSelector.querySelector('.modal-barber-btn.selected');

                if (selectedInModal) {
                    // Hay un barbero seleccionado en el selector del modal
                    const barberId = selectedInModal.dataset.barberoId;
                    const barberName = selectedInModal.dataset.barberoNombre;
                    const barberImage = selectedInModal.dataset.barberoImagen;

                    console.log('✅ [LOAD-BARBER] Barbero seleccionado desde selector del modal:', { id: barberId, nombre: barberName });

                    if (modalBarberImage && barberImage) {
                        modalBarberImage.src = barberImage;
                        modalBarberImage.style.display = 'block';
                        modalBarberImage.alt = barberName || 'Barbero';
                    }

                    if (modalBarberName) {
                        modalBarberName.textContent = barberName;
                        modalBarberName.style.fontWeight = '600';
                        modalBarberName.style.color = '#1b1b1b';
                        modalBarberName.style.display = 'block';
                    }

                    this.selectedBarber = {
                        id: barberId,
                        nombre: barberName,
                        imagen: barberImage
                    };

                    console.log('💾 [LOAD-BARBER] this.selectedBarber actualizado desde modal:', this.selectedBarber);
                    return;
                } else {
                    // Hay selector pero no hay nada seleccionado aún
                    console.log('ℹ️ [LOAD-BARBER] Selector de barberos visible - esperando selección del usuario');
                    // Mantener el selector visible, NO mostrar "Ningún barbero seleccionado"
                    // La imagen y el nombre ya están ocultos por showBarberSelectorInModal()
                    this.selectedBarber = null;
                    return;
                }
            }

            // No hay selector en el modal ni barbero seleccionado - mostrar mensaje
            if (modalBarberImage) {
                modalBarberImage.style.display = 'none';
            }
            if (modalBarberName) {
                modalBarberName.textContent = 'Ningún barbero seleccionado';
                modalBarberName.style.fontWeight = '500';
                modalBarberName.style.color = '#666';
                modalBarberName.style.display = 'block';
            }

            this.selectedBarber = null;
            console.log('🧹 [LOAD-BARBER] this.selectedBarber = null');
            return;
        }

        // Hay barbero seleccionado
        // Obtener la imagen desde el data attribute del botón
        const barberImage = selectedBarberBtn.dataset.barberoImagen;
        const barberName = selectedBarberBtn.title || selectedBarberBtn.dataset.barberoNombre;
        const barberId = selectedBarberBtn.dataset.barberoId;

        console.log('✅ [LOAD-BARBER] Datos del barbero extraídos:', { id: barberId, nombre: barberName, imagen: barberImage });

        if (modalBarberImage && barberImage) {
            modalBarberImage.src = barberImage;
            modalBarberImage.style.display = 'block'; // Mostrar imagen
            modalBarberImage.alt = barberName || 'Barbero';
            console.log('🖼️ [LOAD-BARBER] Imagen de barbero cargada y mostrada');
        } else {
            console.log('⚠️ [LOAD-BARBER] No se pudo cargar imagen:', { modalBarberImage: !!modalBarberImage, barberImage });
        }

        if (modalBarberName) {
            modalBarberName.textContent = barberName;
            modalBarberName.style.fontWeight = '600';
            modalBarberName.style.color = '#1b1b1b';
            modalBarberName.style.display = 'block';
            console.log('📝 [LOAD-BARBER] Nombre de barbero actualizado');
        }

        this.selectedBarber = {
            id: barberId,
            nombre: barberName,
            imagen: barberImage
        };

        console.log('💾 [LOAD-BARBER] this.selectedBarber actualizado:', this.selectedBarber);
    }

    // Confirmar la reserva
    async confirmReservation() {
        // Validar que todos los campos estén completos
        const clientName = document.getElementById('modalClientName').value.trim();
        const clientPhone = document.getElementById('modalClientPhone').value.trim();

        // Validación de barbero (PRIMERO)
        if (!this.selectedBarber) {
            await window.customModal.showAlert(
                'Debes seleccionar un barbero antes de hacer la reserva.<br><br>Por favor cierra este modal, selecciona un barbero en la página y vuelve a intentar.',
                'Barbero No Seleccionado'
            );
            return;
        }

        // Validación de fecha
        if (!this.calendar.getSelectedDate()) {
            await window.customModal.showAlert(
                'Por favor selecciona una fecha para tu reserva.',
                'Fecha Requerida'
            );
            return;
        }

        // Validación de hora
        if (!this.selectedTime) {
            await window.customModal.showAlert(
                'Por favor selecciona un horario disponible.',
                'Horario Requerido'
            );
            return;
        }

        // Validación de nombre
        if (!clientName) {
            await window.customModal.showAlert(
                'Por favor ingresa tu nombre completo.',
                'Nombre Requerido'
            );
            document.getElementById('modalClientName').focus();
            return;
        }

        // Validación de teléfono
        if (!clientPhone) {
            await window.customModal.showAlert(
                'Por favor ingresa tu número de teléfono.',
                'Teléfono Requerido'
            );
            document.getElementById('modalClientPhone').focus();
            return;
        }

        // Validación de formato de teléfono (10 dígitos)
        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(clientPhone)) {
            await window.customModal.showAlert(
                'Por favor ingresa un número de teléfono válido (10 dígitos).<br><br><strong>Ejemplo:</strong> 3001234567',
                'Teléfono Inválido'
            );
            document.getElementById('modalClientPhone').focus();
            return;
        }

        // Obtener datos del usuario autenticado (IMPORTANTE: usar 'user_data')
        const userData = JSON.parse(localStorage.getItem('user_data'));
        const userId = userData?.id;

        // Crear objeto de reserva completo
        const reserva = {
            usuario_id: userId,
            barbero_id: this.selectedBarber.id,
            servicio_nombre: this.selectedService,
            servicio_tipo: this.selectedServiceType, // 'corte' o 'barba'
            servicio_adicional: this.additionalService === 'si',
            servicio_adicional_id: this.selectedAdditionalService?.id || null,
            servicio_adicional_nombre: this.selectedAdditionalService?.nombre || null,
            servicio_adicional_tipo: this.selectedAdditionalService?.tipo || null,
            fecha: this.calendar.getSelectedDate(), // formato: YYYY-MM-DD
            hora: this.selectedTime, // formato: HH:MM
            cliente_nombre: clientName,
            cliente_telefono: clientPhone,
            estado: 'pendiente' // Estados: pendiente, confirmada, completada, cancelada
        };

        console.log('📋 Reserva preparada para enviar:', reserva);

        try {
            // Enviar reserva al backend
            await this.sendReservation(reserva);

            // Construir mensaje de confirmación
            let confirmMessage = `<strong>¡Reserva confirmada exitosamente!</strong><br><br>
                <strong>Fecha:</strong> ${this.formatDate(reserva.fecha)}<br>
                <strong>Hora:</strong> ${this.formatTime(reserva.hora)}<br>
                <strong>Barbero:</strong> ${this.selectedBarber.nombre}<br>
                <strong>Servicio:</strong> ${reserva.servicio_nombre}`;

            // Agregar servicio adicional si existe
            if (this.selectedAdditionalService) {
                confirmMessage += `<br><strong>Servicio Adicional:</strong> ${this.selectedAdditionalService.nombre}`;
            }

            confirmMessage += `<br><br>¡Te esperamos ${clientName}!`;

            // Mostrar confirmación exitosa con modal personalizado
            await window.customModal.showAlert(confirmMessage, 'Reserva Confirmada');

            // Cerrar modal
            this.closeModal();

            // Opcional: Redirigir a página de mis reservas
            // window.location.href = '../perfil/index.html?tab=reservas';

        } catch (error) {
            console.error('❌ Error al crear reserva:', error);
            console.error('❌ Detalles del error:', {
                message: error.message,
                stack: error.stack
            });

            // Mostrar error con modal personalizado
            await window.customModal.showAlert(
                `Hubo un error al procesar tu reserva.<br><br><strong>Error:</strong> ${error.message}<br><br>Por favor intenta nuevamente o contacta con soporte.`,
                'Error al Crear Reserva'
            );
        }
    }

    // Formatear fecha para mostrar (DD/MM/YYYY)
    formatDate(dateString) {
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    }

    // Formatear hora para mostrar (HH:MM AM/PM)
    formatTime(timeString) {
        const [hours, minutes] = timeString.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minutes} ${ampm}`;
    }

    // Enviar reserva al backend
    async sendReservation(reserva) {
        try {
            console.log('🌐 [SEND-RESERVATION] Iniciando envío de reserva al backend');
            console.log('📋 [SEND-RESERVATION] Datos de reserva:', reserva);

            // Obtener token de autenticación (IMPORTANTE: usar 'auth_token')
            const token = localStorage.getItem('auth_token');
            console.log('🔑 [SEND-RESERVATION] Token obtenido:', token ? 'Sí' : 'No');

            console.log('📡 [SEND-RESERVATION] Enviando POST a /api/reservas');
            const response = await fetch('/api/reservas', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(reserva)
            });

            console.log('📥 [SEND-RESERVATION] Respuesta recibida - Status:', response.status, response.statusText);

            if (!response.ok) {
                const errorData = await response.json();
                console.error('❌ [SEND-RESERVATION] Error del servidor:', errorData);
                throw new Error(errorData.error || 'Error al crear la reserva');
            }

            const result = await response.json();
            console.log('✅ [SEND-RESERVATION] Reserva creada exitosamente:', result);

            return result;
        } catch (error) {
            console.error('❌ [SEND-RESERVATION] Error al enviar reserva:', error);
            console.error('❌ [SEND-RESERVATION] Tipo de error:', error.name);
            console.error('❌ [SEND-RESERVATION] Mensaje:', error.message);
            throw error;
        }
    }
}

// ==================== CALENDARIO DEL MODAL ====================

class ModalCalendar {
    constructor() {
        this.currentOffset = 0;
        this.selectedDate = null;
        this.daysToShow = 5;
        // Horizonte de reserva: cuantos dias hacia adelante se pueden elegir
        this.maxDays = 60;
        this.daysContainer = document.getElementById('modalDaysContainer');
        this.prevBtn = document.getElementById('modalPrevDays');
        this.nextBtn = document.getElementById('modalNextDays');

        this.init();
    }

    getDayName(date) {
        // Usar el método nativo de JavaScript para obtener el nombre del día
        // Esto siempre usa la fecha real del sistema, sin arrays manuales
        return date.toLocaleDateString('es-ES', { weekday: 'short' }).toUpperCase();
    }

    getToday() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return today;
    }

    getDatesArray() {
        const dates = [];
        const baseDate = this.getToday();

        for (let i = 0; i < this.daysToShow; i++) {
            const date = new Date(baseDate);
            date.setDate(baseDate.getDate() + this.currentOffset + i);
            dates.push(date);
        }

        return dates;
    }

    renderDays(direction = null) {
        if (direction) {
            this.daysContainer.classList.remove('slide-left', 'slide-right');
            void this.daysContainer.offsetWidth;
            this.daysContainer.classList.add(direction === 'next' ? 'slide-right' : 'slide-left');
        }

        this.daysContainer.innerHTML = '';
        const dates = this.getDatesArray();

        dates.forEach((date, index) => {
            const btn = document.createElement('button');
            btn.className = 'modal-day-btn';
            btn.type = 'button';

            const dayName = this.getDayName(date);
            const dayNumber = date.getDate();

            btn.innerHTML = `
                <span class="day-name">${dayName}</span>
                <span class="day-number">${dayNumber}</span>
            `;

            btn.dataset.date = date.toISOString().split('T')[0];

            if (!this.selectedDate && index === 0 && this.currentOffset === 0) {
                btn.classList.add('selected');
                this.selectedDate = date.toISOString().split('T')[0];
            }

            if (btn.dataset.date === this.selectedDate) {
                btn.classList.add('selected');
            }

            btn.addEventListener('click', () => this.selectDay(btn));
            this.daysContainer.appendChild(btn);
        });

        this.updateNavigationButtons();
    }

    selectDay(button) {
        this.daysContainer.querySelectorAll('.modal-day-btn').forEach(btn => {
            btn.classList.remove('selected');
        });

        button.classList.add('selected');
        this.selectedDate = button.dataset.date;

        console.log('📅 Día seleccionado en modal:', this.selectedDate);

        // Actualizar horas disponibles cuando cambia la fecha
        if (window.reservaModal) {
            const barbersContainer = document.getElementById('barbersContainer');
            const selectedBarberBtn = barbersContainer?.querySelector('button.selected');

            if (selectedBarberBtn) {
                console.log('🔄 [CALENDAR] Fecha cambiada - actualizando horas disponibles');
                window.reservaModal.updateAvailableHours(selectedBarberBtn);
            }
        }
    }

    prevDays() {
        if (this.currentOffset > 0) {
            this.currentOffset -= this.daysToShow;
            if (this.currentOffset < 0) this.currentOffset = 0;
            this.renderDays('prev');
        }
    }

    nextDays() {
        if (this.currentOffset + this.daysToShow < this.maxDays) {
            this.currentOffset += this.daysToShow;
            this.renderDays('next');
        }
    }

    updateNavigationButtons() {
        if (this.currentOffset === 0) {
            this.prevBtn.disabled = true;
        } else {
            this.prevBtn.disabled = false;
        }

        if (this.currentOffset + this.daysToShow >= this.maxDays) {
            this.nextBtn.disabled = true;
        } else {
            this.nextBtn.disabled = false;
        }
    }

    getSelectedDate() {
        return this.selectedDate;
    }

    init() {
        this.renderDays();
        this.prevBtn.addEventListener('click', () => this.prevDays());
        this.nextBtn.addEventListener('click', () => this.nextDays());
    }
}

// Inicializar el modal cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    window.reservaModal = new ReservaModalController();
    console.log('✅ Sistema de modal de reservas cargado');

    // Verificar si se regresa de selección de servicio adicional
    // Esto se hace después de que TODO esté inicializado
    setTimeout(() => {
        console.log('🔍 [INIT] Verificando retorno de servicio adicional (después de inicialización)');
        window.reservaModal.checkReturnFromServiceSelection();
    }, 300); // Reducido a 300ms para apertura más rápida
});
