document.addEventListener("DOMContentLoaded", function () {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }
  window.scrollTo(0, 0);
  requestAnimationFrame(function () {
    window.scrollTo(0, 0);
  });

  var DEFAULT_LOCATION = {
    lat: "45.284209",
    lng: "38.113200",
  };
  var DEFAULT_COUNTDOWN_TARGET = "2026-06-06T15:00:00+03:00";
  var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  var shouldReduceEffects = Boolean(connection && connection.saveData);

  var form = document.querySelector("[data-rsvp-form]");
  var routeButton = document.querySelector(".location__map-btn, .location-card__route");
  var locationCard = document.querySelector(".location-card, .location--fullbleed");
  var countdownContainer = document.querySelector("[data-countdown-target]");

  if (form) {
    var nameInput = form.querySelector('[name="rsvp_name"]');
    var surnameInput = form.querySelector('[name="rsvp_surname"]');
    var attendanceInputs = form.querySelectorAll('[name="rsvp_attendance"]');
    var guestsInput = form.querySelector('[name="rsvp_guest_count"]');
    var companionInput = form.querySelector('[name="rsvp_companion"]');
    var messageInput = form.querySelector('[name="rsvp_message"]');
    var statusNode = form.querySelector("[data-rsvp-status]");
    var submitButton = form.querySelector(".rsvp-form__submit");
    var telegramBotToken = (form.dataset.telegramBotToken || "").trim();
    var telegramChatId = (form.dataset.telegramChatId || "").trim();
    var telegramThreadId = (form.dataset.telegramThreadId || "").trim();
    var telegramProxyUrl = (form.dataset.telegramProxyUrl || "").trim();

    var getErrorNode = function (fieldName) {
      return form.querySelector('[data-error-for="' + fieldName + '"]');
    };

    var setFieldError = function (fieldName, message) {
      var errorNode = getErrorNode(fieldName);
      var field = form.querySelector('[name="' + fieldName + '"]');

      if (errorNode) {
        errorNode.textContent = message;
      }

      if (field) {
        field.setAttribute("aria-invalid", "true");
      }
    };

    var clearFieldError = function (fieldName) {
      var errorNode = getErrorNode(fieldName);
      var fields = form.querySelectorAll('[name="' + fieldName + '"]');

      if (errorNode) {
        errorNode.textContent = "";
      }

      fields.forEach(function (field) {
        field.removeAttribute("aria-invalid");
      });
    };

    var setStatusMessage = function (message, type) {
      if (!statusNode) {
        return;
      }

      statusNode.classList.remove("rsvp-form__status--success", "rsvp-form__status--error");

      if (type) {
        statusNode.classList.add("rsvp-form__status--" + type);
      }

      statusNode.textContent = message;
    };

    var clearStatusMessage = function () {
      setStatusMessage("", "");
    };

    var clearAllErrors = function () {
      clearFieldError("rsvp_name");
      clearFieldError("rsvp_surname");
      clearFieldError("rsvp_attendance");
      clearFieldError("rsvp_guest_count");
      clearFieldError("rsvp_companion");
      clearFieldError("rsvp_message");
      clearStatusMessage();
    };

    var hasValue = function (value) {
      return typeof value === "string" && value.trim().length > 0;
    };

    var getAttendanceLabel = function (value) {
      if (value === "yes") {
        return "Да";
      }

      if (value === "no") {
        return "Нет";
      }

      return "Не указано";
    };

    var buildTelegramMessage = function (payload) {
      return [
        "Новая RSVP-анкета",
        "",
        "Имя: " + payload.name,
        "Фамилия: " + payload.surname,
        "Статус присутствия: " + getAttendanceLabel(payload.attendance),
        "Имя спутника: " + (payload.companion || "—"),
        "Количество гостей: " + payload.guests,
        "Вопросы/пожелания: " + (payload.message || "Не указано"),
      ].join("\n");
    };

    var getTelegramFormBodyString = function (requestBody) {
      var params = new URLSearchParams();
      params.append("chat_id", String(requestBody.chat_id));
      params.append("text", requestBody.text);
      if (requestBody.message_thread_id != null && !Number.isNaN(Number(requestBody.message_thread_id))) {
        params.append("message_thread_id", String(requestBody.message_thread_id));
      }
      return params.toString();
    };

    var sendRsvpToTelegramFormUrlEncoded = function (endpoint, requestBody) {
      return fetch(endpoint, {
        method: "POST",
        mode: "no-cors",
        keepalive: true,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: getTelegramFormBodyString(requestBody),
      }).then(function () {
        return { ok: true };
      });
    };

    /* Chrome на Android часто не отправляет POST в скрытый iframe на другой домен — XHR обычно проходит. */
    var sendRsvpToTelegramXHR = function (endpoint, requestBody) {
      var body = getTelegramFormBodyString(requestBody);
      return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.timeout = 20000;
        xhr.onreadystatechange = function () {
          if (xhr.readyState !== 4) {
            return;
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ ok: true });
            return;
          }
          if (xhr.status === 0) {
            resolve({ ok: true });
            return;
          }
          reject(new Error("Telegram HTTP " + xhr.status));
        };
        xhr.onerror = function () {
          reject(new Error("XHR network"));
        };
        xhr.ontimeout = function () {
          reject(new Error("XHR timeout"));
        };
        xhr.open("POST", endpoint);
        xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
        xhr.send(body);
      });
    };

    /* Обычная отправка формы в скрытый iframe — на iPhone Safari обычно стабильно. */
    var sendRsvpToTelegramViaIframe = function (endpoint, requestBody) {
      return new Promise(function (resolve, reject) {
        var iframeName = "tg_rsvp_" + String(Date.now());
        var iframe = document.createElement("iframe");
        iframe.name = iframeName;
        iframe.setAttribute("title", "Отправка в Telegram");
        iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;opacity:0";
        document.body.appendChild(iframe);

        var hiddenForm = document.createElement("form");
        hiddenForm.method = "POST";
        hiddenForm.action = endpoint;
        hiddenForm.target = iframeName;
        hiddenForm.acceptCharset = "UTF-8";
        hiddenForm.enctype = "application/x-www-form-urlencoded";
        hiddenForm.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none";

        function addHidden(name, value) {
          var input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          input.value = value;
          hiddenForm.appendChild(input);
        }

        addHidden("chat_id", String(requestBody.chat_id));
        addHidden("text", requestBody.text);
        if (requestBody.message_thread_id != null && !Number.isNaN(Number(requestBody.message_thread_id))) {
          addHidden("message_thread_id", String(requestBody.message_thread_id));
        }

        document.body.appendChild(hiddenForm);

        function cleanup() {
          try {
            if (hiddenForm.parentNode) {
              hiddenForm.parentNode.removeChild(hiddenForm);
            }
          } catch (e1) {}
          try {
            if (iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }
          } catch (e2) {}
        }

        try {
          hiddenForm.submit();
        } catch (submitErr) {
          cleanup();
          reject(submitErr);
          return;
        }

        window.setTimeout(function () {
          cleanup();
          resolve({ ok: true });
        }, 1600);
      });
    };

    var buildTelegramRequestBody = function (payload) {
      var requestBody = {
        chat_id: telegramChatId,
        text: buildTelegramMessage(payload),
      };

      if (hasValue(telegramThreadId)) {
        var threadIdNumber = Number(telegramThreadId);
        if (!Number.isNaN(threadIdNumber)) {
          requestBody.message_thread_id = threadIdNumber;
        }
      }

      return requestBody;
    };

    /* Прокси (Cloudflare Worker и т.п.): нормальный CORS POST — на Android Chrome стабильнее, чем прямой вызов api.telegram.org. */
    var sendRsvpToTelegramViaProxy = function (payload) {
      var body = { text: buildTelegramMessage(payload) };
      if (hasValue(telegramThreadId)) {
        var tid = Number(telegramThreadId);
        if (!Number.isNaN(tid)) {
          body.message_thread_id = tid;
        }
      }

      return fetch(telegramProxyUrl, {
        method: "POST",
        mode: "cors",
        keepalive: true,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }).then(function (response) {
        return response.text().then(function (raw) {
          var data;
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch (e) {
            throw new Error("Ответ прокси не JSON");
          }
          if (!response.ok || !data.ok) {
            var msg =
              (data && (data.description || data.error)) || "Ошибка прокси (" + response.status + ")";
            throw new Error(String(msg));
          }
          return data;
        });
      });
    };

    var sendRsvpToTelegramDirect = function (requestBody) {
      var endpoint = "https://api.telegram.org/bot" + telegramBotToken + "/sendMessage";
      var isAndroid = /Android/i.test(navigator.userAgent || "");

      if (isAndroid) {
        return sendRsvpToTelegramFormUrlEncoded(endpoint, requestBody)
          .catch(function () {
            return sendRsvpToTelegramXHR(endpoint, requestBody);
          })
          .catch(function () {
            return sendRsvpToTelegramViaIframe(endpoint, requestBody);
          });
      }

      return sendRsvpToTelegramViaIframe(endpoint, requestBody)
        .catch(function () {
          return sendRsvpToTelegramFormUrlEncoded(endpoint, requestBody);
        })
        .catch(function () {
          return sendRsvpToTelegramXHR(endpoint, requestBody);
        });
    };

    var sendRsvpToTelegram = function (payload) {
      var requestBody = buildTelegramRequestBody(payload);

      if (hasValue(telegramProxyUrl)) {
        return sendRsvpToTelegramViaProxy(payload).catch(function (err) {
          if (hasValue(telegramBotToken) && hasValue(telegramChatId)) {
            return sendRsvpToTelegramDirect(requestBody);
          }
          throw err;
        });
      }

      return sendRsvpToTelegramDirect(requestBody);
    };

    var validateForm = function () {
      var errorsCount = 0;
      var firstInvalidField = null;
      var nameValue = nameInput ? nameInput.value.trim() : "";
      var surnameValue = surnameInput ? surnameInput.value.trim() : "";
      var guestsValue = guestsInput ? guestsInput.value.trim() : "";
      var messageValue = messageInput ? messageInput.value.trim() : "";
      var attendanceValue = form.querySelector('[name="rsvp_attendance"]:checked');
      var namePattern = /^[A-Za-zА-Яа-яЁё\s'-]+$/;

      if (!hasValue(nameValue)) {
        setFieldError("rsvp_name", "Укажите ваше имя.");
        firstInvalidField = firstInvalidField || nameInput;
        errorsCount += 1;
      } else if (nameValue.length < 2 || !namePattern.test(nameValue)) {
        setFieldError("rsvp_name", "Имя должно содержать минимум 2 символа без спецзнаков.");
        firstInvalidField = firstInvalidField || nameInput;
        errorsCount += 1;
      }

      if (!hasValue(surnameValue)) {
        setFieldError("rsvp_surname", "Укажите вашу фамилию.");
        firstInvalidField = firstInvalidField || surnameInput;
        errorsCount += 1;
      } else if (surnameValue.length < 2 || !namePattern.test(surnameValue)) {
        setFieldError("rsvp_surname", "Фамилия должна содержать минимум 2 символа без спецзнаков.");
        firstInvalidField = firstInvalidField || surnameInput;
        errorsCount += 1;
      }

      if (!attendanceValue) {
        setFieldError("rsvp_attendance", "Выберите, сможете ли присутствовать.");
        firstInvalidField = firstInvalidField || attendanceInputs[0];
        errorsCount += 1;
      }

      if (!hasValue(guestsValue)) {
        setFieldError("rsvp_guest_count", "Укажите количество гостей.");
        firstInvalidField = firstInvalidField || guestsInput;
        errorsCount += 1;
      } else {
        var guestsNumber = Number(guestsValue);
        var isInteger = Number.isInteger(guestsNumber);

        if (!isInteger || guestsNumber < 1 || guestsNumber > 10) {
          setFieldError("rsvp_guest_count", "Допустимое количество гостей: от 1 до 10.");
          firstInvalidField = firstInvalidField || guestsInput;
          errorsCount += 1;
        }
      }

      if (hasValue(messageValue) && messageValue.length > 300) {
        setFieldError("rsvp_message", "Сообщение не должно превышать 300 символов.");
        firstInvalidField = firstInvalidField || messageInput;
        errorsCount += 1;
      }

      return {
        isValid: errorsCount === 0,
        firstInvalidField: firstInvalidField,
      };
    };

    [nameInput, surnameInput, guestsInput, companionInput, messageInput].forEach(function (input) {
      if (!input) {
        return;
      }

      input.addEventListener("input", function () {
        clearFieldError(input.name);
        clearStatusMessage();
      });
    });

    attendanceInputs.forEach(function (input) {
      input.addEventListener("change", function () {
        clearFieldError("rsvp_attendance");
        clearStatusMessage();
      });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearAllErrors();

      var validationResult = validateForm();
      if (!validationResult.isValid) {
        setStatusMessage("Пожалуйста, исправьте ошибки в форме и попробуйте снова.", "error");
        if (validationResult.firstInvalidField) {
          validationResult.firstInvalidField.focus();
        }
        return;
      }
      var hasDirect =
        hasValue(telegramBotToken) && hasValue(telegramChatId);
      var hasProxy = hasValue(telegramProxyUrl);
      if (!hasDirect && !hasProxy) {
        setStatusMessage("Форма временно недоступна: не настроена отправка в Telegram.", "error");
        return;
      }

      var attendanceField = form.querySelector('[name="rsvp_attendance"]:checked');
      var formData = {
        name: nameInput ? nameInput.value.trim() : "",
        surname: surnameInput ? surnameInput.value.trim() : "",
        attendance: attendanceField ? attendanceField.value : "",
        guests: guestsInput ? guestsInput.value.trim() : "",
        companion: companionInput ? companionInput.value.trim() : "",
        message: messageInput ? messageInput.value.trim() : "",
      };

      if (submitButton) {
        submitButton.disabled = true;
      }

      setStatusMessage("Отправляем анкету в Telegram...", "");

      sendRsvpToTelegram(formData)
        .then(function () {
          setStatusMessage("Спасибо! Ваша анкета успешно отправлена.", "success");
          form.reset();
        })
        .catch(function (err) {
          var detail =
            err && err.message
              ? err.message
              : "Не удалось отправить анкету в Telegram. Попробуйте еще раз.";
          setStatusMessage(detail, "error");
        })
        .finally(function () {
          if (submitButton) {
            submitButton.disabled = false;
          }
        });
    });
  }

  if (routeButton) {
    var href = routeButton.getAttribute("href");
    if (!href || href === "#") {
      var lat = locationCard && locationCard.dataset.locationLat ? locationCard.dataset.locationLat : DEFAULT_LOCATION.lat;
      var lng = locationCard && locationCard.dataset.locationLng ? locationCard.dataset.locationLng : DEFAULT_LOCATION.lng;
      routeButton.setAttribute("href", "https://yandex.ru/maps/?rtext=~" + encodeURIComponent(lat + "," + lng) + "&rtt=auto");
    }
    routeButton.setAttribute("target", "_blank");
    routeButton.setAttribute("rel", "noopener noreferrer");
  }

  if (countdownContainer) {
    var countdownTarget = countdownContainer.dataset.countdownTarget || DEFAULT_COUNTDOWN_TARGET;
    var timerDays = countdownContainer.querySelector('[data-countdown-unit="days"]');
    var timerHours = countdownContainer.querySelector('[data-countdown-unit="hours"]');
    var timerMinutes = countdownContainer.querySelector('[data-countdown-unit="minutes"]');
    var timerSeconds = countdownContainer.querySelector('[data-countdown-unit="seconds"]');
    var targetDate = new Date(countdownTarget);

    if (!Number.isNaN(targetDate.getTime()) && timerDays && timerHours && timerMinutes && timerSeconds) {
      var countdownIntervalId = null;
      var updateCountdown = function () {
        var now = new Date();
        var difference = targetDate.getTime() - now.getTime();

        if (difference < 0) {
          difference = 0;
        }

        var totalSeconds = Math.floor(difference / 1000);
        var days = Math.floor(totalSeconds / 86400);
        var hours = Math.floor((totalSeconds % 86400) / 3600);
        var minutes = Math.floor((totalSeconds % 3600) / 60);
        var seconds = totalSeconds % 60;

        timerDays.textContent = String(days);
        timerHours.textContent = String(hours);
        timerMinutes.textContent = String(minutes).padStart(2, "0");
        timerSeconds.textContent = String(seconds).padStart(2, "0");
      };

      var stopCountdown = function () {
        if (countdownIntervalId === null) {
          return;
        }
        clearInterval(countdownIntervalId);
        countdownIntervalId = null;
      };

      var startCountdown = function () {
        if (countdownIntervalId !== null) {
          return;
        }
        countdownIntervalId = window.setInterval(updateCountdown, 1000);
      };

      updateCountdown();
      startCountdown();

      document.addEventListener("visibilitychange", function () {
        if (document.hidden) {
          stopCountdown();
          return;
        }
        updateCountdown();
        startCountdown();
      });
    }
  }

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var parallaxSections = Array.prototype.slice.call(document.querySelectorAll("[data-parallax-section]"));

  if (parallaxSections.length > 0 && !prefersReducedMotion.matches && !shouldReduceEffects) {
    var activeParallaxSections = new Set(parallaxSections);
    var isParallaxTicking = false;

    var updateParallax = function () {
      var viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      activeParallaxSections.forEach(function (section) {
        var rect = section.getBoundingClientRect();
        var sectionCenter = rect.top + rect.height / 2;
        var viewportCenter = viewportHeight / 2;
        var rawSpeed = Number(section.dataset.parallaxSpeed);
        var speed = Number.isFinite(rawSpeed) ? rawSpeed : 0.08;
        var clampedSpeed = Math.min(Math.max(speed, 0.03), 0.18);
        var shift = (viewportCenter - sectionCenter) * clampedSpeed;
        var boundedShift = Math.max(Math.min(shift, 24), -24);

        section.style.setProperty("--parallax-shift", boundedShift.toFixed(2) + "px");
      });

      isParallaxTicking = false;
    };

    var requestParallaxTick = function () {
      if (isParallaxTicking) {
        return;
      }

      isParallaxTicking = true;
      window.requestAnimationFrame(updateParallax);
    };

    if ("IntersectionObserver" in window) {
      activeParallaxSections.clear();

      var parallaxObserver = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              activeParallaxSections.add(entry.target);
            } else {
              activeParallaxSections.delete(entry.target);
            }
          });

          requestParallaxTick();
        },
        {
          root: null,
          threshold: 0,
          rootMargin: "25% 0px 25% 0px",
        }
      );

      parallaxSections.forEach(function (section) {
        parallaxObserver.observe(section);
      });
    }

    window.addEventListener("scroll", requestParallaxTick, { passive: true });
    window.addEventListener("resize", requestParallaxTick);
    requestParallaxTick();
  }

  var revealItems = [];
  var pushRevealItems = function (selector, effect) {
    var nodes = document.querySelectorAll(selector);

    nodes.forEach(function (node, index) {
      revealItems.push({
        node: node,
        effect: effect,
        index: index,
      });
    });
  };

  pushRevealItems(".welcome__inner > *", "soft");
  pushRevealItems(".location__panel > *", "up");
  pushRevealItems(".schedule-grid__row", "up");
  pushRevealItems(".countdown__container > *", "soft");
  pushRevealItems(".countdown-timer__item", "up");
  pushRevealItems(".dress-code__intro > *", "fade");
  pushRevealItems(".dress-code-color", "soft");
  pushRevealItems(".important-info .container > *", "fade");
  pushRevealItems(".rsvp__intro > *", "fade");
  pushRevealItems(".rsvp-form", "up");

  if (revealItems.length > 0) {
    if (shouldReduceEffects) {
      revealItems.forEach(function (item) {
        item.node.classList.add("is-visible");
      });
      return;
    }

    revealItems.forEach(function (item) {
      item.node.classList.add("reveal");
      item.node.style.willChange = "opacity, transform";

      if (item.effect === "fade") {
        item.node.classList.add("reveal--fade");
      } else if (item.effect === "soft") {
        item.node.classList.add("reveal--soft");
      }

      item.node.style.transitionDelay = String(item.index * 70) + "ms";
    });

    var showItem = function (element) {
      element.classList.add("is-visible");
      element.style.willChange = "auto";
    };

    if ("IntersectionObserver" in window) {
      var revealObserver = new IntersectionObserver(
        function (entries, observer) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) {
              return;
            }

            showItem(entry.target);
            observer.unobserve(entry.target);
          });
        },
        {
          root: null,
          threshold: 0.2,
          rootMargin: "0px 0px -8% 0px",
        }
      );

      revealItems.forEach(function (item) {
        revealObserver.observe(item.node);
      });
    } else {
      revealItems.forEach(function (item) {
        showItem(item.node);
      });
    }
  }

  (function initDressCodeSlider() {
    var slider = document.querySelector("[data-dress-code-slider]");
    if (!slider) return;
    var track = slider.querySelector(".dress-code-slider__track");
    var slides = slider.querySelectorAll(".dress-code-slider__slide");
    var prevBtn = slider.querySelector("[data-dress-code-slider-prev]");
    var nextBtn = slider.querySelector("[data-dress-code-slider-next]");
    var counter = slider.querySelector("[data-dress-code-slider-counter]");
    var total = slides.length;
    if (!track || total === 0) return;

    var index = 0;

    function goTo(i) {
      index = (i + total) % total;
      track.style.transform = "translateX(" + -index * 100 + "%)";
      if (counter) counter.textContent = index + 1 + " / " + total;
    }

    if (prevBtn) prevBtn.addEventListener("click", function () { goTo(index - 1); });
    if (nextBtn) nextBtn.addEventListener("click", function () { goTo(index + 1); });

    goTo(0);
  })();
});
