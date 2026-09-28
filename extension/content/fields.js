// Détection et remplissage des champs de formulaire, indépendamment du site :
// on lit le DOM (libellés, options, obligatoire ou non) au lieu de dépendre des
// classes CSS d'un site précis, qui changent souvent.
(() => {
  const C = globalThis.CAND;
  const F = (C.Fields = {});

  const SKIP_TYPES = new Set([
    "hidden", "submit", "button", "reset", "image", "password", "search", "range", "color",
  ]);

  // ---- Libellés -----------------------------------------------------------

  function textOfIds(ids) {
    return ids
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || "")
      .join(" ");
  }

  // « Email Email » (libellé répété pour les lecteurs d'écran) → « Email ».
  function cleanLabel(raw) {
    let t = String(raw || "").replace(/\s+/g, " ").trim();
    t = t.replace(/\((obligatoire|required|optionnel|optional|facultatif)\)/gi, "").trim();
    t = t.replace(/\s*\*+\s*$/, "").trim();
    const dup = /^(.{3,}?)\s*\1$/.exec(t);
    if (dup) t = dup[1].trim();
    return t.slice(0, 300);
  }

  function requiredFromText(raw) {
    return /\*\s*$/.test(String(raw || "").trim()) || /\b(obligatoire|required)\b/i.test(raw || "");
  }

  function ownLabelRaw(el) {
    const parts = [];
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) parts.push(textOfIds(labelledBy));
    if (el.labels && el.labels.length) {
      parts.push([...el.labels].map((l) => l.textContent).join(" "));
    }
    const aria = el.getAttribute("aria-label");
    if (aria) parts.push(aria);
    return parts.join(" ").trim();
  }

  function groupLabelRaw(el) {
    const fieldset = el.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend && legend.textContent.trim()) return legend.textContent;
    }
    const group = el.closest('[role="radiogroup"], [role="group"]');
    if (group) {
      const by = group.getAttribute("aria-labelledby");
      if (by && textOfIds(by).trim()) return textOfIds(by);
      const aria = group.getAttribute("aria-label");
      if (aria) return aria;
    }
    return nearbyText(el);
  }

  // Dernier recours : le texte court qui précède le champ dans son voisinage.
  function nearbyText(el) {
    let node = el;
    for (let depth = 0; depth < 4 && node.parentElement; depth++) {
      node = node.parentElement;
      for (const child of node.children) {
        if (child === el || child.contains(el)) break;
        const t = (child.textContent || "").replace(/\s+/g, " ").trim();
        if (t.length >= 3 && t.length <= 250) return t;
      }
    }
    return "";
  }

  function optionLabel(input) {
    const fromLabel = input.labels && input.labels.length
      ? [...input.labels].map((l) => l.textContent).join(" ")
      : "";
    const text = (fromLabel || input.getAttribute("aria-label") || input.value || "")
      .replace(/\s+/g, " ")
      .trim();
    return cleanLabel(text);
  }

  function isPlaceholderOption(option) {
    if (!option) return true;
    if (option.value === "") return true;
    return /^(select|choisir|selectionner|choose|please|veuillez|--|\.\.\.)/.test(C.norm(option.textContent));
  }

  // ---- Classification -----------------------------------------------------

  const NUMERIC_LABEL = /combien|how many|nombre d'?annees|years? of|annees? d'?experience|number of years/;

  function kindOfInput(el, label) {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    if (type === "number") return "number";
    if (type === "date") return "date";
    const inputmode = (el.getAttribute("inputmode") || "").toLowerCase();
    if (inputmode === "numeric" || inputmode === "decimal" || NUMERIC_LABEL.test(C.norm(label))) {
      return "number";
    }
    return "text";
  }

  function isEmpty(f) {
    switch (f.kind) {
      case "radio":
        return !f.optionEls.some((r) => r.checked);
      case "checkbox":
        return !f.el.checked;
      case "select": {
        const selected = f.el.selectedOptions && f.el.selectedOptions[0];
        return isPlaceholderOption(selected);
      }
      case "file":
        return !(f.el.files && f.el.files.length);
      default:
        return !f.el.value.trim();
    }
  }

  function currentValue(f) {
    switch (f.kind) {
      case "radio": {
        const checked = f.optionEls.find((r) => r.checked);
        return checked ? optionLabel(checked) : "";
      }
      case "checkbox":
        return f.el.checked ? "yes" : "no";
      case "select":
        return isEmpty(f) ? "" : (f.el.selectedOptions[0].textContent || "").trim();
      case "file":
        return f.el.files && f.el.files.length ? f.el.files[0].name : "";
      default:
        return f.el.value;
    }
  }

  // ---- Scan ---------------------------------------------------------------

  F.scan = (root) => {
    const fields = [];
    const radioSeen = new Set();
    let n = 0;

    for (const el of root.querySelectorAll("input, select, textarea")) {
      if (el.disabled || el.readOnly) continue;
      if (el.closest("[data-cand-ignore]")) continue;

      const tag = el.tagName;
      const type = tag === "INPUT" ? (el.getAttribute("type") || "text").toLowerCase() : "";
      if (SKIP_TYPES.has(type)) continue;

      const hiddenByDesign = type === "radio" || type === "checkbox" || type === "file";
      if (!hiddenByDesign && !C.isVisible(el)) continue;
      if ((type === "radio" || type === "checkbox") && !C.isVisible(el)) {
        // Cases souvent masquées visuellement : on regarde leur libellé.
        if (!(el.labels && [...el.labels].some(C.isVisible))) continue;
      }

      const base = {
        fid: `f${n}`,
        el,
        name: el.getAttribute("name") || "",
        domId: el.id || "",
        autocomplete: (el.getAttribute("autocomplete") || "").toLowerCase(),
      };

      if (type === "radio") {
        const key = el.name ? `n:${el.name}` : `e:${n}`;
        if (radioSeen.has(key)) continue;
        radioSeen.add(key);
        const group = el.name
          ? [...root.querySelectorAll('input[type="radio"]')].filter((r) => r.name === el.name && !r.disabled)
          : [el];
        const raw = groupLabelRaw(el) || ownLabelRaw(el);
        const f = {
          ...base,
          kind: "radio",
          el: group[0],
          optionEls: group,
          options: group.map(optionLabel),
          label: cleanLabel(raw),
          required: group.some((r) => r.required || r.getAttribute("aria-required") === "true") || requiredFromText(raw),
        };
        f.empty = isEmpty(f);
        f.value = currentValue(f);
        fields.push(f);
        n++;
        continue;
      }

      if (type === "checkbox") {
        const raw = ownLabelRaw(el) || groupLabelRaw(el);
        const f = {
          ...base,
          kind: "checkbox",
          options: [],
          label: cleanLabel(raw),
          required: el.required || el.getAttribute("aria-required") === "true" || requiredFromText(raw),
          checked: el.checked,
        };
        f.empty = isEmpty(f);
        f.value = currentValue(f);
        fields.push(f);
        n++;
        continue;
      }

      if (type === "file") {
        const raw = ownLabelRaw(el) || nearbyText(el);
        const f = {
          ...base,
          kind: "file",
          options: [],
          accept: (el.getAttribute("accept") || "").toLowerCase(),
          label: cleanLabel(raw),
          required: el.required || el.getAttribute("aria-required") === "true" || requiredFromText(raw),
        };
        f.empty = isEmpty(f);
        f.value = currentValue(f);
        fields.push(f);
        n++;
        continue;
      }

      if (tag === "SELECT") {
        if (el.multiple) continue;
        const raw = ownLabelRaw(el) || groupLabelRaw(el);
        const optionEls = [...el.options].filter((o) => !isPlaceholderOption(o));
        const f = {
          ...base,
          kind: "select",
          optionEls,
          options: optionEls.map((o) => cleanLabel(o.textContent)),
          label: cleanLabel(raw),
          required: el.required || el.getAttribute("aria-required") === "true" || requiredFromText(raw),
        };
        f.empty = isEmpty(f);
        f.value = currentValue(f);
        fields.push(f);
        n++;
        continue;
      }

      // input texte-like ou textarea
      const raw = ownLabelRaw(el) || el.getAttribute("placeholder") || groupLabelRaw(el) || el.name;
      const label = cleanLabel(raw);
      const f = {
        ...base,
        kind: tag === "TEXTAREA" ? "textarea" : kindOfInput(el, label),
        options: [],
        label,
        combo: el.getAttribute("role") === "combobox" || Boolean(el.getAttribute("aria-autocomplete")),
        required: el.required || el.getAttribute("aria-required") === "true" || requiredFromText(raw),
      };
      f.empty = isEmpty(f);
      f.value = currentValue(f);
      fields.push(f);
      n++;
    }
    return fields;
  };

  F.refresh = (f) => {
    f.empty = isEmpty(f);
    f.value = currentValue(f);
    return f;
  };

  // Empreinte d'une étape : sert à savoir si un clic sur Suivant a fait avancer
  // le formulaire ou s'il est resté sur la même étape (erreurs de validation).
  F.signature = (root) => {
    if (!root) return "";
    const heading = root.querySelector("h1, h2, h3, legend")?.textContent || "";
    const progress = root.querySelector('progress, [role="progressbar"]');
    const step = progress ? progress.getAttribute("aria-valuenow") || progress.getAttribute("value") || "" : "";
    return [
      C.norm(heading),
      step,
      F.scan(root).map((f) => `${f.kind}:${f.label}`).join("|"),
    ].join("#");
  };

  // ---- Correspondance de réponses ----------------------------------------

  const YES = new Set(["yes", "oui", "true", "1"]);
  const NO = new Set(["no", "non", "false", "0"]);

  // Index de l'option qui correspond à `answer`, ou -1. Exacte d'abord, puis
  // approchée si elle est sans ambiguïté : on ne force jamais un choix.
  F.matchOption = (answer, labels) => {
    const target = C.norm(answer);
    if (!target) return -1;
    const norms = labels.map(C.norm);

    let i = norms.indexOf(target);
    if (i >= 0) return i;

    const set = YES.has(target) ? YES : NO.has(target) ? NO : null;
    if (set) {
      i = norms.findIndex((o) => set.has(o));
      if (i >= 0) return i;
    }

    const starts = norms.map((o, idx) => (o.startsWith(target) ? idx : -1)).filter((x) => x >= 0);
    if (starts.length === 1) return starts[0];

    const contains = norms
      .map((o, idx) => (o.includes(target) || (o.length >= 3 && target.includes(o)) ? idx : -1))
      .filter((x) => x >= 0);
    return contains.length === 1 ? contains[0] : -1;
  };

  // ---- Remplissage --------------------------------------------------------

  // Liste de suggestions (ex. ville LinkedIn) : on tape, puis on choisit.
  async function pickSuggestion(el, value) {
    const want = C.norm(value).split(/[ ,]/)[0];
    const options = await C.waitFor(
      () => {
        const list = [...document.querySelectorAll('[role="listbox"] [role="option"], ul[role="listbox"] li')].filter(C.isVisible);
        return list.length ? list : null;
      },
      { timeout: 2500, interval: 200 }
    );
    if (!options) return;
    const pick = options.find((o) => C.norm(o.textContent).includes(want)) || options[0];
    C.click(pick);
  }

  // Applique une réponse à un champ. Renvoie true si la valeur est bien en place.
  F.apply = async (f, answer) => {
    switch (f.kind) {
      case "text":
      case "number":
      case "date":
      case "textarea": {
        f.el.focus();
        C.setNativeValue(f.el, answer);
        C.fire(f.el, "input", "change");
        if (f.combo) await pickSuggestion(f.el, answer);
        f.el.blur();
        return f.el.value.trim() !== "";
      }
      case "select": {
        const i = F.matchOption(answer, f.options);
        if (i < 0) return false;
        C.setNativeValue(f.el, f.optionEls[i].value);
        C.fire(f.el, "input", "change");
        return !isEmpty(f);
      }
      case "radio": {
        const i = F.matchOption(answer, f.options);
        if (i < 0) return false;
        const input = f.optionEls[i];
        input.click();
        if (!input.checked && input.labels && input.labels[0]) input.labels[0].click();
        return input.checked;
      }
      case "checkbox": {
        const want = YES.has(C.norm(answer));
        if (f.el.checked !== want) {
          f.el.click();
          if (f.el.checked !== want && f.el.labels && f.el.labels[0]) f.el.labels[0].click();
        }
        return f.el.checked === want;
      }
      default:
        return false;
    }
  };

  F.setFile = (f, file) => {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    f.el.files = transfer.files;
    C.fire(f.el, "input", "change");
    return f.el.files.length > 0;
  };

  // Surlignage des champs que l'utilisateur doit compléter.
  F.flag = (f, on) => {
    const target =
      f.kind === "radio" ? f.optionEls[0].closest("fieldset") || f.optionEls[0].parentElement : f.el;
    if (!target) return;
    if (on) {
      target.setAttribute("data-cand-flag", "1");
      target.style.outline = "2px solid #f59e0b";
      target.style.outlineOffset = "2px";
    } else {
      target.removeAttribute("data-cand-flag");
      target.style.outline = "";
      target.style.outlineOffset = "";
    }
  };

  // ---- Localisation du formulaire ----------------------------------------

  const CONTROL_SELECTOR = "input:not([type=hidden]):not([type=search]), select, textarea";

  // Boîte de dialogue visible contenant un formulaire (modales de candidature).
  F.dialogRoot = () => {
    const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open]')]
      .filter(C.isVisible)
      .filter((d) => d.querySelector(CONTROL_SELECTOR));
    return dialogs.length ? dialogs[dialogs.length - 1] : null;
  };

  // Modale si elle existe, sinon le formulaire le plus fourni de la page.
  F.genericRoot = () => {
    const dialog = F.dialogRoot();
    if (dialog) return dialog;

    const candidates = [...document.querySelectorAll("form")]
      .filter(C.isVisible)
      .filter((form) => form.getAttribute("role") !== "search")
      .map((form) => ({ form, n: form.querySelectorAll(CONTROL_SELECTOR).length }))
      // Un champ e-mail isolé (newsletter, recherche) n'est pas une candidature.
      .filter(({ form, n }) => n >= 2 || form.querySelector("input[type=file], textarea"))
      .sort((a, b) => b.n - a.n);
    return candidates.length ? candidates[0].form : null;
  };
})();
