(() => {
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });

  // src/shared/log.ts
  var debugEnabled = false;
  function setDebug(enabled) {
    debugEnabled = enabled;
  }
  function isDebug() {
    return debugEnabled;
  }
  function info(tag, message) {
    console.log(`[${tag}] ${message}`);
  }
  function plain(message) {
    console.log(message);
  }
  function debug(tag, message) {
    if (debugEnabled) console.log(`[${tag}] ${message}`);
  }
  function errorText(err) {
    return err instanceof Error ? err.message : String(err);
  }

  // src/shared/module.ts
  function startModules(modules, onStop, signature) {
    const started = [];
    for (const module of modules) {
      try {
        module.init();
        started.push(module);
      } catch (err) {
        info(module.name, `\xE9chec du module : ${errorText(err)}`);
      }
    }
    onStop(() => {
      for (const module of [...started].reverse()) {
        try {
          module.dispose?.();
        } catch (err) {
          info(module.name, `\xE9chec de l'arr\xEAt du module : ${errorText(err)}`);
        }
      }
    });
    const list = started.map((m) => m.name).join(", ") || "aucun";
    if (signature) info(signature, `modules charg\xE9s : ${list}`);
    else plain(`modules charg\xE9s : ${list}`);
  }

  // src/shared/config.ts
  var DEFAULT_CLIENT_CONFIG = {
    debug: false,
    noclip: { speed: 40, fastMultiplier: 2.5, mouseCoefficient: 0.01 }
  };
  var DEFAULT_SERVER_CONFIG = {
    admins: [],
    spawn: { enabled: true },
    noclip: { allowAll: true },
    teleport: { allowAll: true },
    vehicles: { allowAll: true, health: 2e3 }
  };
  var ConfigEvents = {
    /** client → serveur : « envoie-moi la config » (au chargement du script client). */
    Request: "mira:config:request",
    /** serveur → client : la ClientConfig. */
    Sync: "mira:config:sync"
  };

  // src/server/lib/toml.ts
  var import_node_fs = __require("node:fs");
  var import_node_path = __require("node:path");

  // node_modules/smol-toml/dist/error.js
  function getLineColFromPtr(string, ptr) {
    let lines = string.slice(0, ptr).split(/\r?\n/);
    return [lines.length, lines.pop().length + 1];
  }
  function makeCodeBlock(string, line, column) {
    let lines = string.split(/\r?\n/);
    let codeblock = "";
    let numberLen = (Math.log10(line + 1) | 0) + 1;
    for (let i = line - 1; i <= line + 1; i++) {
      let l = lines[i - 1];
      if (!l)
        continue;
      codeblock += i.toString().padEnd(numberLen, " ");
      codeblock += ":  ";
      codeblock += l;
      codeblock += "\n";
      if (i === line) {
        codeblock += " ".repeat(numberLen + column + 2);
        codeblock += "^\n";
      }
    }
    return codeblock;
  }
  var TomlError = class _TomlError extends Error {
    line;
    column;
    codeblock;
    constructor(message, options) {
      const [line, column] = getLineColFromPtr(options.toml, options.ptr);
      const codeblock = makeCodeBlock(options.toml, line, column);
      super(`Invalid TOML document: ${message}

${codeblock}`, options);
      this.line = line;
      this.column = column;
      this.codeblock = codeblock;
    }
    /** @internal */
    static x(message, ctx, ptr) {
      throw new _TomlError(message, { toml: ctx.s, ptr: ptr ?? ctx.p });
    }
  };

  // node_modules/smol-toml/dist/primitive.js
  function parseString(ctx) {
    let startPtr = ctx.p;
    let c = ctx.s.charCodeAt(ctx.p++);
    let first = c;
    let isLiteral = c === 39;
    let isMultiline = c === ctx.s.charCodeAt(ctx.p) && c === ctx.s.charCodeAt(ctx.p + 1);
    if (isMultiline) {
      if ((c = ctx.s.charCodeAt(ctx.p += 2)) === 10)
        ctx.p++;
      else if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)
        ctx.p += 2;
    }
    let parsed = "";
    let sliceStart = ctx.p;
    let state = 0;
    for (; ctx.p < ctx.s.length; ctx.p++) {
      c = ctx.s.charCodeAt(ctx.p);
      if (isMultiline && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)) {
        state = state && 3;
      } else if (c < 32 && c !== 9 || c === 127) {
        TomlError.x("control characters are not allowed in strings", ctx);
      } else if ((!state || state === 3) && c === first && (!isMultiline || ctx.s.charCodeAt(ctx.p + 1) === first && ctx.s.charCodeAt(ctx.p + 2) === first)) {
        if (isMultiline) {
          if (ctx.s.charCodeAt(ctx.p + 3) === first)
            ctx.p++;
          if (ctx.s.charCodeAt(ctx.p + 3) === first)
            ctx.p++;
        }
        if (!state) {
          let s = ctx.s.slice(sliceStart, ctx.p);
          parsed = parsed ? parsed + s : s;
        }
        ctx.p += isMultiline ? 3 : 1;
        return parsed;
      } else if (!state) {
        if (!isLiteral && c === 92) {
          parsed += ctx.s.slice(sliceStart, sliceStart = ctx.p);
          state = 1;
        }
      } else if (state === 1) {
        if (c === 120 || c === 117 || c === 85) {
          let errPtr = ctx.p++ - 1;
          let value = 0;
          let len = c === 120 ? 2 : c === 117 ? 4 : 8;
          for (let j = 0; j < len; j++, ctx.p++) {
            let hex = ctx.s.charCodeAt(ctx.p);
            let digit = (
              /* 0-9 */
              hex >= 48 && hex <= 57 ? hex - 48 : (
                /* A-F */
                hex >= 65 && hex <= 70 ? hex - 65 + 10 : (
                  /* a-f */
                  hex >= 97 && hex <= 102 ? hex - 97 + 10 : -1
                )
              )
            );
            if (digit < 0)
              TomlError.x("invalid non-hex character in unicode escape", ctx);
            value = value << 4 | digit;
          }
          if (value < 0 || value > 1114111 || value >= 55296 && value <= 57343) {
            TomlError.x("invalid unicode escape", ctx, errPtr);
          }
          parsed += String.fromCodePoint(value);
          sliceStart = ctx.p--;
          state = 0;
        } else if (isMultiline && (c === 32 || c === 9)) {
          state = 2;
        } else {
          if (c === 98)
            parsed += "\b";
          else if (c === 116)
            parsed += "	";
          else if (c === 110)
            parsed += "\n";
          else if (c === 102)
            parsed += "\f";
          else if (c === 114)
            parsed += "\r";
          else if (c === 101)
            parsed += "\x1B";
          else if (c === 34)
            parsed += '"';
          else if (c === 92)
            parsed += "\\";
          else
            TomlError.x("unrecognised escape sequence", ctx);
          sliceStart = ctx.p + 1;
          state = 0;
        }
      } else if (c !== 32 && c !== 9) {
        if (state === 2)
          TomlError.x("invalid escape: only line-ending whitespace may be escaped", ctx, sliceStart);
        state = !isLiteral && c === 92 ? 1 : 0;
        sliceStart = ctx.p;
      }
    }
    TomlError.x("unfinished string", ctx, startPtr);
  }

  // node_modules/smol-toml/dist/date.js
  var DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[Tt ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|z|[-+]\d{2}:\d{2})?$/i;
  var TomlDate = class _TomlDate extends Date {
    #hasDate = false;
    #hasTime = false;
    #offset = null;
    constructor(date, fasttype, unsafeDelim) {
      let hasDate = true;
      let hasTime = true;
      let offset = "Z";
      let c;
      if (typeof date === "string") {
        if (fasttype)
          prep: {
            if (fasttype < 3) {
              if (+date.slice(11, 13) > 23) {
                date = "";
                break prep;
              }
              if (fasttype === 2) {
                offset = null;
                date += "Z";
              } else if ((c = date.charCodeAt(date.length - 1)) !== 90 && c !== 122) {
                offset = date.slice(date.length - 6);
              }
              if (unsafeDelim)
                date = date.slice(0, 10) + "T" + date.slice(11);
            } else if (fasttype === 4) {
              date = +date.slice(0, 2) > 23 ? "" : `0000-01-01T${date}Z`;
            }
            hasDate = fasttype !== 4;
            hasTime = fasttype !== 3;
          }
        else {
          let match = date.match(DATE_TIME_RE);
          if (match) {
            if (!match[1]) {
              hasDate = false;
              date = `0000-01-01T${date}`;
            }
            hasTime = !!match[2];
            hasTime && date[10] === " " && (date = date.replace(" ", "T"));
            if (match[2] && +match[2] > 23) {
              date = "";
            } else {
              offset = match[3] || null;
              if (!offset && hasTime)
                date += "Z";
            }
          } else {
            date = "";
          }
        }
      }
      super(date);
      if (!isNaN(this.getTime())) {
        this.#hasDate = hasDate;
        this.#hasTime = hasTime;
        this.#offset = offset;
      }
    }
    isDateTime() {
      return this.#hasDate && this.#hasTime;
    }
    isLocal() {
      return !this.#hasDate || !this.#hasTime || !this.#offset;
    }
    isDate() {
      return this.#hasDate && !this.#hasTime;
    }
    isTime() {
      return this.#hasTime && !this.#hasDate;
    }
    isValid() {
      return this.#hasDate || this.#hasTime;
    }
    toISOString() {
      let iso = super.toISOString();
      if (this.isDate())
        return iso.slice(0, 10);
      if (this.isTime())
        return iso.slice(11, 23);
      if (this.#offset === null)
        return iso.slice(0, -1);
      if (this.#offset === "Z" || this.#offset === "z")
        return iso;
      let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
      offset = this.#offset[0] === "-" ? offset : -offset;
      let offsetDate = new Date(this.getTime() - offset * 6e4);
      return offsetDate.toISOString().slice(0, -1) + this.#offset;
    }
    static wrapAsOffsetDateTime(jsDate, offset = "Z") {
      let date = new _TomlDate(jsDate);
      date.#offset = offset;
      return date;
    }
    static wrapAsLocalDateTime(jsDate) {
      let date = new _TomlDate(jsDate);
      date.#offset = null;
      return date;
    }
    static wrapAsLocalDate(jsDate) {
      let date = new _TomlDate(jsDate);
      date.#hasTime = false;
      date.#offset = null;
      return date;
    }
    static wrapAsLocalTime(jsDate) {
      let date = new _TomlDate(jsDate);
      date.#hasDate = false;
      date.#offset = null;
      return date;
    }
  };

  // node_modules/smol-toml/dist/extract.js
  function isDigit(char, base = 10) {
    return base === 16 ? char > 47 && char < 58 || char > 64 && char < 71 || char > 96 && char < 103 : char > 47 && char < 48 + base;
  }
  function isEndOfValue(char, delim) {
    return char === 32 || char === 9 || char === 10 || char === 13 || // Structure end or next value delimiter
    delim && (char === delim || char === 44) || // Comment
    char === 35;
  }
  function extractValue(ctx, end) {
    let errPtr = ctx.p;
    let c = ctx.s.charCodeAt(ctx.p);
    if (c === 91 || c === 123) {
      ctx.d-- || TomlError.x("document contains excessively nested structures. aborting.", ctx);
      let value = c === 91 ? parseArray(ctx) : parseInlineTable(ctx);
      ctx.d++;
      return value;
    }
    if (c === 34 || c === 39) {
      return parseString(ctx);
    }
    if (c === 116) {
      if (ctx.s.charCodeAt(++ctx.p) !== 114 || ctx.s.charCodeAt(++ctx.p) !== 117 || ctx.s.charCodeAt(++ctx.p) !== 101)
        TomlError.x("invalid value", ctx, errPtr);
      return ctx.p++, true;
    }
    if (c === 102) {
      if (ctx.s.charCodeAt(++ctx.p) !== 97 || ctx.s.charCodeAt(++ctx.p) !== 108 || ctx.s.charCodeAt(++ctx.p) !== 115 || ctx.s.charCodeAt(++ctx.p) !== 101)
        TomlError.x("invalid value", ctx, errPtr);
      return ctx.p++, false;
    }
    if (c === 43 || c === 45) {
      return parseNumber(ctx, ctx.p, ctx.s.charCodeAt(++ctx.p), 44 - c, end);
    }
    if (ctx.s.charCodeAt(ctx.p + 4) === 45 && ctx.s.charCodeAt(ctx.p + 7) === 45) {
      return parseDate(ctx, c, end);
    }
    if (ctx.s.charCodeAt(ctx.p + 2) === 58) {
      return parseTime(ctx, c, end);
    }
    return parseNumber(ctx, ctx.p, c, 0, end);
  }
  function parseNumber(ctx, startPtr, startChr, sign, endChr) {
    let c = startChr;
    let state = 0;
    let hasUnderscores = false;
    if (c === 105) {
      if (ctx.s.charCodeAt(++ctx.p) !== 110 || ctx.s.charCodeAt(++ctx.p) !== 102)
        TomlError.x("invalid value", ctx, startPtr);
      return ctx.p++, (sign || 1) / 0;
    }
    if (c === 110) {
      if (ctx.s.charCodeAt(++ctx.p) !== 97 || ctx.s.charCodeAt(++ctx.p) !== 110)
        TomlError.x("invalid value", ctx, startPtr);
      return ctx.p++, NaN;
    }
    if (c === 48) {
      if (++ctx.p >= ctx.s.length || isEndOfValue(c = ctx.s.charCodeAt(ctx.p), endChr))
        return ctx.bi === true ? 0n : 0;
      if (!sign) {
        if (c === 120)
          return parseIntegerBaseN(ctx, startPtr, 16, endChr);
        else if (c === 98)
          return parseIntegerBaseN(ctx, startPtr, 2, endChr);
        else if (c === 111)
          return parseIntegerBaseN(ctx, startPtr, 8, endChr);
      }
      if (c === 46)
        state = 2;
      else if (c === 101 || c === 69)
        state = 4;
      else
        TomlError.x("illegal leading zero", ctx, startPtr);
    } else if (!isDigit(c))
      TomlError.x("invalid value", ctx, startPtr);
    while (++ctx.p < ctx.s.length && (c = ctx.s.charCodeAt(ctx.p), !isEndOfValue(c, endChr))) {
      if (!state)
        state = 1;
      if (c === 95) {
        if (!(state & 1))
          TomlError.x("illegal underscore", ctx);
        state += 11;
        hasUnderscores = true;
      } else if (state === 1 && c === 46)
        state = 2;
      else if ((state === 1 || state === 3) && (c === 101 || c === 69))
        state = 4;
      else if (state === 4 && (c === 43 || c === 45)) {
        state = 6;
      } else if (!isDigit(c))
        TomlError.x(`illegal character in numeric literal`, ctx);
      else if (state > 9)
        state -= 11;
      else if (!(state & 1))
        state++;
    }
    if (!state) {
      let val = (startChr - 48) * (sign || 1);
      return ctx.bi === true ? BigInt(val) : val;
    }
    if (!(state & 1))
      TomlError.x("unfinished numeric value", ctx, startPtr);
    let str = ctx.s.slice(startPtr, ctx.p);
    if (hasUnderscores)
      str = str.replaceAll("_", "");
    return state > 1 ? parseFloat(str) : parseInteger(ctx, str, 10, startPtr);
  }
  function parseIntegerBaseN(ctx, startPtr, base, endChr) {
    let c, underscore = 1;
    while (++ctx.p < ctx.s.length && (c = ctx.s.charCodeAt(ctx.p), !isEndOfValue(c, endChr))) {
      if (c === 95) {
        if (underscore & 1)
          TomlError.x("illegal underscore", ctx);
        underscore = 3;
      } else if (!isDigit(c, base))
        TomlError.x(`illegal character in numeric literal`, ctx);
      else if (underscore & 1)
        underscore--;
    }
    if (underscore & 1)
      TomlError.x("unfinished numeric value", ctx);
    let str = ctx.s.slice(startPtr + 2, ctx.p);
    if (underscore)
      str = str.replaceAll("_", "");
    return parseInteger(ctx, str, base, startPtr);
  }
  function parseInteger(ctx, str, base, startPtr) {
    if (ctx.bi !== true)
      int: {
        let val = parseInt(str, base);
        if (!Number.isSafeInteger(val)) {
          if (ctx.bi)
            break int;
          TomlError.x("integer value cannot be represented losslessly", ctx, startPtr);
        }
        return val;
      }
    return base === 10 ? BigInt(str) : BigInt((base === 2 ? "0b" : base === 8 ? "0o" : "0x") + str);
  }
  function parseDate(ctx, c, endChr) {
    let startPtr = ctx.p++, unsafeSeparator;
    if (!isDigit(c) || !isDigit(ctx.s.charCodeAt(ctx.p++)) || !isDigit(ctx.s.charCodeAt(ctx.p++)) || !isDigit(ctx.s.charCodeAt(ctx.p++))) {
      return parseNumber(ctx, ctx.p = startPtr, c, 0, endChr);
    }
    ctx.p += 5;
    if (!isDigit(ctx.s.charCodeAt(ctx.p++)))
      TomlError.x("invalid date-time: date part is malformed", ctx, startPtr);
    if (ctx.p >= ctx.s.length || ((c = ctx.s.charCodeAt(ctx.p)) !== 32 || (unsafeSeparator = true, !isDigit(ctx.s.charCodeAt(ctx.p + 1)))) && c !== 84 && c !== 116) {
      let t2 = ctx.s.slice(startPtr, ctx.p);
      return readDate(ctx, t2, 3, false, startPtr);
    }
    if (ctx.s.charCodeAt(ctx.p += 3) !== 58)
      TomlError.x("invalid date-time: time part is malformed", ctx, startPtr);
    if (ctx.s.charCodeAt(ctx.p += 3) === 58)
      ctx.p += 3;
    if (ctx.s.charCodeAt(ctx.p) === 46)
      while (isDigit(ctx.s.charCodeAt(++ctx.p)))
        ;
    if (c = ctx.s.charCodeAt(ctx.p)) {
      if (c === 90 || c === 122) {
        let t2 = ctx.s.slice(startPtr, ++ctx.p);
        return readDate(ctx, t2, 1, unsafeSeparator, startPtr, "[+00:00]");
      }
      if (c === 43 || c === 45) {
        let t2 = ctx.s.slice(startPtr, ctx.p += 6);
        return readDate(ctx, t2, 1, unsafeSeparator, startPtr, !ctx.ld && "[" + ctx.s.slice(ctx.p - 6, ctx.p) + "]");
      }
    }
    let t = ctx.s.slice(startPtr, ctx.p);
    return readDate(ctx, t, 2, unsafeSeparator, startPtr);
  }
  function parseTime(ctx, c, endChr) {
    let start = ctx.p;
    if (!isDigit(c) || !isDigit(ctx.s.charCodeAt(++ctx.p))) {
      return parseNumber(ctx, --ctx.p, c, 0, endChr);
    }
    if (ctx.s.charCodeAt(ctx.p += 4) === 58)
      ctx.p += 3;
    if (ctx.s.charCodeAt(ctx.p) === 46)
      while (isDigit(ctx.s.charCodeAt(++ctx.p)))
        ;
    let t = ctx.s.slice(start, ctx.p);
    return readDate(ctx, t, 4, false, start);
  }
  function readDate(ctx, str, type, unsafeDelim, errPtr, temporalSuffix) {
    if (ctx.ld) {
      let date = new TomlDate(str, type, unsafeDelim);
      if (!date.isValid())
        TomlError.x("invalid date", ctx, errPtr);
      return date;
    }
    try {
      if (temporalSuffix)
        str += temporalSuffix;
      switch (type) {
        case 1:
          return Temporal.ZonedDateTime.from(str);
        case 2:
          return Temporal.PlainDateTime.from(str);
        case 3:
          return Temporal.PlainDate.from(str);
        case 4:
          return Temporal.PlainTime.from(str);
      }
    } catch (e) {
      TomlError.x(e instanceof Error ? e.message : "" + e, ctx, errPtr);
    }
  }

  // node_modules/smol-toml/dist/util.js
  function skipComment(ctx) {
    for (; ctx.p < ctx.s.length; ctx.p++) {
      let c = ctx.s.charCodeAt(ctx.p);
      if (c === 10)
        break;
      if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10) {
        ctx.p++;
        break;
      }
      if (c < 32 && c !== 9 || c === 127) {
        TomlError.x("control characters are not allowed in comments", ctx);
      }
    }
  }
  function skipVoid(ctx, banNewLines, banComments) {
    let c;
    while (ctx.p < ctx.s.length) {
      while (ctx.p < ctx.s.length && ((c = ctx.s.charCodeAt(ctx.p)) === 32 || c === 9 || !banNewLines && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)))
        ctx.p++;
      if (banComments || c !== 35)
        break;
      skipComment(ctx);
    }
  }

  // node_modules/smol-toml/dist/struct.js
  function parseKey(ctx, end = 61) {
    let startPtr;
    let state = 0;
    let parsed = [];
    let sliceStart;
    let c = ctx.s.charCodeAt(startPtr = ctx.p);
    do {
      if (c === end) {
        if (!state)
          TomlError.x("unexpected end of key", ctx);
        if (state === 1)
          parsed.push(ctx.s.slice(sliceStart, ctx.p));
        return ctx.p++, parsed;
      } else if (c === 46) {
        if (!state)
          TomlError.x("illegal empty bare key", ctx);
        if (state === 1)
          parsed.push(ctx.s.slice(sliceStart, ctx.p));
        state = 0;
      } else if (!state && (c === 34 || c === 39)) {
        if (c === ctx.s.charCodeAt(ctx.p + 1) && c === ctx.s.charCodeAt(ctx.p + 2))
          TomlError.x("illegal quoted key: multiline strings are not allowed", ctx);
        parsed.push(parseString(ctx));
        state = 2;
        ctx.p--;
      } else if (c === 32 || c === 9) {
        if (state === 1) {
          parsed.push(ctx.s.slice(sliceStart, ctx.p));
          state = 2;
        }
      } else if (state === 2 || c < 48 && c !== 45 || c > 57 && c < 65 || c > 90 && c < 97 && c !== 95 || c > 122) {
        TomlError.x("illegal character in key", ctx);
      } else if (!state) {
        state = 1;
        sliceStart = ctx.p;
      }
    } while (c = ctx.s.charCodeAt(++ctx.p));
    TomlError.x("incomplete key-value: cannot find end of key", ctx, startPtr);
  }
  function parseInlineTable(ctx) {
    let startPtr = ctx.p++;
    let res = /* @__PURE__ */ Object.create(null);
    let seen = /* @__PURE__ */ new Set();
    let c;
    while (ctx.p < ctx.s.length) {
      skipVoid(ctx);
      if ((c = ctx.s.charCodeAt(ctx.p)) === 125) {
        ctx.p++;
        return res;
      }
      let k;
      let t = res;
      let hasOwn = false;
      let errPtr = ctx.p;
      let key = parseKey(ctx);
      for (let i = 0; i < key.length; i++) {
        if (i)
          t = hasOwn ? t[k] : t[k] = /* @__PURE__ */ Object.create(null);
        k = key[i];
        if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
          TomlError.x("trying to redefine an already defined value", ctx, errPtr);
        }
        let unsafe = k === "__proto__";
        if (ctx.uk && (unsafe || k === "constructor")) {
          t = ctx.uk !== 1 && TomlError.x("document contains an unsafe property", ctx, errPtr);
          break;
        }
        if (!hasOwn && unsafe) {
          Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        }
      }
      if (hasOwn) {
        TomlError.x("trying to redefine an already defined value", ctx, errPtr);
      }
      skipVoid(ctx, true, true);
      let value = extractValue(
        ctx,
        125
        /* } */
      );
      if (t && typeof (t[k] = value) === "object")
        seen.add(value);
      skipVoid(ctx);
      if ((c = ctx.s.charCodeAt(ctx.p++)) === 125) {
        return res;
      }
      if (c !== 44)
        TomlError.x("expected comma or end of structure", ctx, ctx.p - 1);
    }
    TomlError.x("unfinished table", ctx, startPtr);
  }
  function parseArray(ctx) {
    let startPtr = ctx.p++;
    let res = [];
    let c;
    while (ctx.p < ctx.s.length) {
      skipVoid(ctx);
      if ((c = ctx.s.charCodeAt(ctx.p)) === 93) {
        ctx.p++;
        return res;
      }
      res.push(extractValue(
        ctx,
        93
        /* ] */
      ));
      skipVoid(ctx);
      if ((c = ctx.s.charCodeAt(ctx.p++)) === 93) {
        return res;
      }
      if (c !== 44)
        TomlError.x("expected comma or end of structure", ctx, ctx.p - 1);
    }
    TomlError.x("unfinished array", ctx, startPtr);
  }

  // node_modules/smol-toml/dist/parse.js
  function peekTable(ctx, key, table2, meta, type) {
    let t = table2;
    let m = meta;
    let k;
    let hasOwn = false;
    let state;
    for (let i = 0; i < key.length; i++) {
      if (i) {
        t = hasOwn ? t[k] : t[k] = /* @__PURE__ */ Object.create(null);
        m = (state = m[k]).c;
        if (type === 0 && (state.t === 1 || state.t === 2)) {
          return null;
        }
        if (state.t === 2) {
          let l = t.length - 1;
          t = t[l];
          m = m[l].c;
        }
      }
      k = key[i];
      if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
        return null;
      }
      if (!hasOwn) {
        let unsafe = k === "__proto__";
        if (ctx.uk && (unsafe || k === "constructor"))
          return false;
        if (unsafe) {
          Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
          Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
        }
        m[k] = {
          t: i < key.length - 1 && type === 2 ? 3 : type,
          d: false,
          i: 0,
          c: /* @__PURE__ */ Object.create(null)
        };
      }
    }
    state = m[k];
    if (state.t !== type && !(type === 1 && state.t === 3)) {
      return null;
    }
    if (type === 2) {
      if (!state.d) {
        state.d = true;
        t[k] = [];
      }
      t[k].push(t = /* @__PURE__ */ Object.create(null));
      state.c[state.i++] = state = { t: 1, d: false, i: 0, c: /* @__PURE__ */ Object.create(null) };
    }
    if (state.d) {
      return null;
    }
    state.d = true;
    if (type === 1) {
      t = hasOwn ? t[k] : t[k] = /* @__PURE__ */ Object.create(null);
    } else if (type === 0 && hasOwn) {
      return null;
    }
    return [k, t, state.c];
  }
  function validateTablePeek(ctx, peek, ptr) {
    if (peek === null || ctx.uk === 2)
      TomlError.x(peek === null ? "trying to redefine an already defined table or value" : "document contains an unsafe property", ctx, ptr);
  }
  function parse(toml, options = {}) {
    let ctx = {
      s: toml,
      p: 0,
      d: options.maxDepth ?? 1e3,
      bi: options.integersAsBigInt ?? false,
      ld: options.useLegacyDate ?? true,
      uk: options.unsafeKeyBehaviour === "throw" ? 2 : options.unsafeKeyBehaviour === "drop" ? 1 : 0
    };
    let res = /* @__PURE__ */ Object.create(null);
    let meta = /* @__PURE__ */ Object.create(null);
    let tmp;
    let skipping = false;
    let tbl = res;
    let m = meta;
    if (toml.charCodeAt(0) === 65279)
      ctx.p++;
    skipVoid(ctx);
    while (ctx.p < toml.length) {
      if (toml.charCodeAt(ctx.p) === 91) {
        let isTableArray = toml.charCodeAt(++ctx.p) === 91;
        tmp = ctx.p += +isTableArray;
        skipping = false;
        let k = parseKey(
          ctx,
          93
          /* ] */
        );
        if (isTableArray) {
          if (toml.charCodeAt(ctx.p) !== 93) {
            TomlError.x("expected end of table array declaration", ctx);
          }
          ctx.p++;
        }
        let p = peekTable(
          ctx,
          k,
          res,
          meta,
          isTableArray ? 2 : 1
          /* Type.EXPLICIT */
        );
        if (!p) {
          validateTablePeek(ctx, p, tmp);
          skipping = true;
        } else {
          m = p[2];
          tbl = p[1];
        }
      } else {
        tmp = ctx.p;
        let k = parseKey(ctx);
        let p = peekTable(
          ctx,
          k,
          tbl,
          m,
          0
          /* Type.DOTTED */
        );
        if (!p && !skipping)
          validateTablePeek(ctx, p, tmp);
        skipVoid(ctx, true, true);
        let v = extractValue(ctx, void 0);
        if (p && !skipping)
          p[1][p[0]] = v;
      }
      skipVoid(ctx, true);
      if (ctx.p < toml.length && (tmp = toml.charCodeAt(ctx.p)) !== 10 && (tmp !== 13 || toml.charCodeAt(ctx.p + 1) !== 10)) {
        TomlError.x("each key-value declaration must be followed by an end-of-line", ctx);
      }
      skipVoid(ctx);
    }
    return res;
  }

  // node_modules/smol-toml/dist/stringify.js
  var HAS_WELLFORMED = !!"".isWellFormed;

  // src/server/lib/toml.ts
  function resourceName() {
    try {
      return mp.resources.getCurrentName();
    } catch {
      return "mira_utils";
    }
  }
  function readResourceFile(name) {
    const resource = resourceName();
    try {
      const content = mp.resources.loadFile(resource, name);
      if (typeof content === "string" && content.length > 0) return content;
    } catch {
    }
    return (0, import_node_fs.readFileSync)((0, import_node_path.resolve)("resources", resource, name), "utf8");
  }
  function readToml(name) {
    try {
      return parse(readResourceFile(name));
    } catch (err) {
      info("config", `lecture impossible de ${name} (${errorText(err)})`);
      return null;
    }
  }
  function table(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  // src/server/modules/config.ts
  var REQUEST_COOLDOWN_MS = 2e3;
  var lastRequest = /* @__PURE__ */ new Map();
  var clientConfig = DEFAULT_CLIENT_CONFIG;
  var serverConfig = DEFAULT_SERVER_CONFIG;
  function getServerConfig() {
    return serverConfig;
  }
  function num(section, key, fallback, min, max) {
    const value = section[key];
    if (value === void 0) return fallback;
    if (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max) return value;
    info("config", `${key} = ${String(value)} invalide (attendu ${min} \xE0 ${max}), ${fallback} utilis\xE9`);
    return fallback;
  }
  function bool(section, key, fallback) {
    const value = section[key];
    if (value === void 0) return fallback;
    if (typeof value === "boolean") return value;
    info("config", `${key} = ${String(value)} invalide (attendu true ou false), ${fallback} utilis\xE9`);
    return fallback;
  }
  function strings(section, key, fallback) {
    const value = section[key];
    if (value === void 0) return fallback;
    if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value;
    info("config", `${key} invalide (attendu une liste de textes), liste vide utilis\xE9e`);
    return fallback;
  }
  function load() {
    const raw = readToml("config.toml");
    if (!raw) {
      info("config", "config.toml illisible : valeurs par d\xE9faut utilis\xE9es");
      clientConfig = DEFAULT_CLIENT_CONFIG;
      serverConfig = DEFAULT_SERVER_CONFIG;
      setDebug(DEFAULT_CLIENT_CONFIG.debug);
      return;
    }
    const general = table(raw.general);
    const admin = table(raw.admin);
    const spawn2 = table(raw.spawn);
    const noclip2 = table(raw.noclip);
    const teleport2 = table(raw.teleport);
    const vehicles2 = table(raw.vehicles);
    const dc = DEFAULT_CLIENT_CONFIG.noclip;
    const ds = DEFAULT_SERVER_CONFIG;
    const debugMode = bool(general, "debug", DEFAULT_CLIENT_CONFIG.debug);
    setDebug(debugMode);
    clientConfig = {
      debug: debugMode,
      noclip: {
        speed: num(noclip2, "speed", dc.speed, 1, 500),
        fastMultiplier: num(noclip2, "fast_multiplier", dc.fastMultiplier, 1, 20),
        mouseCoefficient: num(noclip2, "mouse_coefficient", dc.mouseCoefficient, 1e-3, 1)
      }
    };
    serverConfig = {
      admins: strings(admin, "players", ds.admins),
      spawn: { enabled: bool(spawn2, "enabled", ds.spawn.enabled) },
      noclip: { allowAll: bool(noclip2, "allow_all", ds.noclip.allowAll) },
      teleport: { allowAll: bool(teleport2, "allow_all", ds.teleport.allowAll) },
      vehicles: {
        allowAll: bool(vehicles2, "allow_all", ds.vehicles.allowAll),
        health: num(vehicles2, "health", ds.vehicles.health, 1, 1e5)
      }
    };
    const access = (allowAll) => allowAll ? "tout le monde" : "admins";
    debug(
      "config",
      `charg\xE9e : ${serverConfig.admins.length} admin(s) ; noclip ${clientConfig.noclip.speed} m/s (\xD7${clientConfig.noclip.fastMultiplier} avec Shift), ${access(serverConfig.noclip.allowAll)} ; teleport ${access(serverConfig.teleport.allowAll)} ; vehicles ${access(serverConfig.vehicles.allowAll)}`
    );
  }
  var config = {
    name: "config",
    init() {
      load();
      mp.events.onClient(ConfigEvents.Request, (player) => {
        const now = Date.now();
        if (now - (lastRequest.get(player.id) ?? 0) < REQUEST_COOLDOWN_MS) return;
        lastRequest.set(player.id, now);
        player.emit(ConfigEvents.Sync, clientConfig);
      });
      mp.events.on("playerDisconnected", (playerId) => {
        lastRequest.delete(playerId);
      });
    },
    dispose() {
      lastRequest.clear();
    }
  };

  // src/shared/noclip-events.ts
  var NoclipEvents = {
    /** Client → serveur : le joueur demande à basculer le noclip. */
    Request: "noclip:request",
    /** Serveur → client : état accordé (`true` = actif). */
    Set: "noclip:set"
  };

  // src/shared/notify-events.ts
  var NotifyEvents = {
    /** serveur → client : message à afficher au joueur (texte) : console F8 + bandeau à l'écran. */
    Show: "mira:notify",
    /** serveur → client : lignes à écrire dans la console F8 seulement (listes longues). */
    Print: "mira:notify:print"
  };

  // src/server/lib/notify.ts
  function notify(player, text2) {
    if (player) player.emit(NotifyEvents.Show, text2);
    else plain(text2);
  }
  function printLines(player, lines) {
    if (player) player.emit(NotifyEvents.Print, lines);
    else for (const line of lines) plain(line);
  }

  // src/server/lib/permissions.ts
  function isAdmin(player) {
    return getServerConfig().admins.includes(player.nickname);
  }
  function canUse(player, allowAll) {
    return allowAll || isAdmin(player);
  }

  // src/server/modules/noclip.ts
  var TOGGLE_COOLDOWN_MS = 500;
  var active = /* @__PURE__ */ new Set();
  var lastToggle = /* @__PURE__ */ new Map();
  function isAllowed(player) {
    return canUse(player, getServerConfig().noclip.allowAll);
  }
  function setNoclip(playerId, enabled) {
    if (enabled) active.add(playerId);
    else active.delete(playerId);
    if (!mp.players.exists(playerId)) return;
    mp.players.at(playerId).emit(NoclipEvents.Set, enabled);
  }
  function isInNoclip(playerId) {
    return active.has(playerId);
  }
  var noclip = {
    name: "noclip",
    init() {
      mp.events.onClient(NoclipEvents.Request, (player) => {
        const now = Date.now();
        if (now - (lastToggle.get(player.id) ?? 0) < TOGGLE_COOLDOWN_MS) return;
        lastToggle.set(player.id, now);
        if (!isAllowed(player)) {
          debug("noclip", `refus\xE9 pour ${player.nickname} (${player.id})`);
          notify(player, "noclip : r\xE9serv\xE9 aux admins");
          return;
        }
        const enabled = !active.has(player.id);
        debug("noclip", `${player.nickname} (${player.id}) : ${enabled ? "activ\xE9" : "d\xE9sactiv\xE9"}`);
        setNoclip(player.id, enabled);
      });
      mp.events.on(
        "damage",
        (attackerId, data) => active.has(attackerId) || active.has(data?.victimId) ? false : void 0
      );
      mp.events.on("shootAction", (playerId) => active.has(playerId) ? false : void 0);
      mp.events.on("meleeAction", (playerId) => active.has(playerId) ? false : void 0);
      mp.events.on("throwGrenade", (playerId) => active.has(playerId) ? false : void 0);
      mp.events.on("playerDeath", (playerId) => {
        if (active.has(playerId)) setNoclip(playerId, false);
      });
      mp.events.on("playerRespawn", (playerId) => {
        if (active.has(playerId)) setNoclip(playerId, false);
      });
      mp.events.on("playerDisconnected", (playerId) => {
        active.delete(playerId);
        lastToggle.delete(playerId);
      });
    },
    dispose() {
      active.clear();
      lastToggle.clear();
    }
  };

  // src/shared/spawn-events.ts
  var SpawnEvents = {
    /** client → serveur : « mon jeu est chargé, connais-tu ma position ? ». */
    Check: "mira:spawn:check",
    /** serveur → client : « je ne te connais pas : spawne-toi » (position serveur encore à 0 0 0). */
    Needed: "mira:spawn:needed"
  };

  // src/server/lib/position.ts
  function hasKnownPosition(player) {
    const [x, y, z] = player.position;
    return Math.abs(x) >= 1 || Math.abs(y) >= 1 || Math.abs(z) >= 1;
  }

  // src/server/modules/spawn.ts
  var CHECK_COOLDOWN_MS = 5e3;
  var lastCheck = /* @__PURE__ */ new Map();
  var spawn = {
    name: "spawn",
    init() {
      mp.events.onClient(SpawnEvents.Check, (player) => {
        if (!getServerConfig().spawn.enabled) return;
        const now = Date.now();
        if (now - (lastCheck.get(player.id) ?? 0) < CHECK_COOLDOWN_MS) return;
        lastCheck.set(player.id, now);
        if (hasKnownPosition(player)) {
          debug("spawn", `${player.nickname} (${player.id}) : position d\xE9j\xE0 connue`);
          return;
        }
        debug("spawn", `${player.nickname} (${player.id}) : position inconnue (0 0 0), spawn demand\xE9`);
        player.emit(SpawnEvents.Needed);
      });
      mp.events.on("playerSpawn", (playerId) => {
        debug("spawn", `joueur ${playerId} spawn\xE9 (\xE9v\xE9nement playerSpawn)`);
      });
      mp.events.on("playerDisconnected", (playerId) => {
        lastCheck.delete(playerId);
      });
    },
    dispose() {
      lastCheck.clear();
    }
  };

  // src/shared/teleport-events.ts
  var TeleportEvents = {
    /** serveur → client : se téléporter à (x, y, z | null = poser au sol, yaw | null = garder l'orientation). */
    To: "mira:teleport:to",
    /** serveur → client : se téléporter au marqueur posé sur la carte (commande tpm). */
    ToMarker: "mira:teleport:marker"
  };

  // src/server/modules/teleport.ts
  var MAX_XY = 2e4;
  var MIN_Z = -1e3;
  var MAX_Z = 5e3;
  function parseCoord(raw) {
    if (raw === void 0) return Number.NaN;
    const cleaned = raw.trim().replace(/,$/, "").replace(",", ".");
    return cleaned === "" ? Number.NaN : Number(cleaned);
  }
  function format(value) {
    return value.toFixed(2);
  }
  function allowedPlayer(player, command) {
    if (!player) {
      info("teleport", `${command} : commande \xE0 taper en jeu (F8), pas dans le terminal du serveur`);
      return null;
    }
    if (!canUse(player, getServerConfig().teleport.allowAll)) {
      notify(player, `${command} : r\xE9serv\xE9 aux admins`);
      return null;
    }
    return player;
  }
  var teleport = {
    name: "teleport",
    init() {
      mp.commands.add("tp", (caller, args) => {
        const player = allowedPlayer(caller, "tp");
        if (!player) return;
        const [x, y] = [parseCoord(args[0]), parseCoord(args[1])];
        const z = args[2] === void 0 ? null : parseCoord(args[2]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || z !== null && !Number.isFinite(z)) {
          notify(
            player,
            "usage : tp <x> <y> [z] [orientation]   (sans z : pos\xE9 au sol ; exemple : tp -1456.9 1038.3 16.8)"
          );
          return;
        }
        if (Math.abs(x) > MAX_XY || Math.abs(y) > MAX_XY || z !== null && (z < MIN_Z || z > MAX_Z)) {
          notify(player, `tp : coordonn\xE9es hors carte (x et y entre \xB1${MAX_XY}, z entre ${MIN_Z} et ${MAX_Z})`);
          return;
        }
        const yawArg = parseCoord(args[3]);
        const yaw = Number.isFinite(yawArg) ? yawArg : null;
        debug(
          "teleport",
          `${player.nickname} (${player.id}) \u2192 ${format(x)} ${format(y)} ${z === null ? "(sol)" : format(z)}`
        );
        player.emit(TeleportEvents.To, x, y, z, yaw);
      });
      mp.commands.add("tpm", (caller) => {
        const player = allowedPlayer(caller, "tpm");
        if (!player) return;
        debug("teleport", `${player.nickname} (${player.id}) \u2192 marqueur`);
        player.emit(TeleportEvents.ToMarker);
      });
    },
    dispose() {
      mp.commands.remove("tp");
      mp.commands.remove("tpm");
    }
  };

  // src/shared/vehicle-events.ts
  var VehicleEvents = {
    /** serveur → client : s'asseoir au volant du véhicule (ID réseau) dès qu'il est chargé. */
    SeatIn: "mira:vehicle:seat",
    /** serveur → client : descendre du véhicule actuel (avant sa suppression). */
    Leave: "mira:vehicle:leave"
  };

  // src/server/modules/vehicles.ts
  var DV_RADIUS = 6;
  var DESTROY_DELAY_MS = 500;
  var MAX_SUGGESTIONS = 8;
  var catalog = [];
  var owned = /* @__PURE__ */ new Map();
  var pendingDestroy = /* @__PURE__ */ new Map();
  function text(value) {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  }
  function loadCatalog() {
    const raw = readToml("vehicles.toml");
    const entries = Array.isArray(raw?.vehicle) ? raw.vehicle : [];
    const seen = /* @__PURE__ */ new Set();
    catalog = [];
    entries.forEach((value, index) => {
      const entry = table(value);
      const name = text(entry.name)?.toLowerCase();
      const model = text(entry.model);
      const appearance = text(entry.appearance);
      if (!name || !model || !appearance) {
        info("vehicles", `vehicles.toml, v\xE9hicule n\xB0${index + 1} ignor\xE9 : name, model et appearance sont obligatoires`);
        return;
      }
      if (seen.has(name)) {
        info("vehicles", `vehicles.toml : nom \xAB ${name} \xBB en double, seul le premier est gard\xE9`);
        return;
      }
      seen.add(name);
      catalog.push({
        name,
        label: text(entry.label) ?? name,
        category: text(entry.category)?.toLowerCase() ?? "autre",
        model,
        appearance,
        tested: entry.tested !== false
      });
    });
    debug("vehicles", `catalogue : ${catalog.length} v\xE9hicule(s)`);
  }
  function resolveVehicle(args) {
    const query = args[0]?.trim();
    if (!query) return { error: "usage : car <nom>   (liste : carlist [recherche])" };
    if (query.startsWith("Vehicle.")) {
      const appearance = args[1]?.trim();
      if (!appearance) return { error: "usage : car Vehicle.<record> <apparence>" };
      return { entry: { name: query, label: query, category: "direct", model: query, appearance, tested: false } };
    }
    const q = query.toLowerCase();
    const exact = catalog.find((e) => e.name === q);
    if (exact) return { entry: exact };
    const matches = catalog.filter((e) => e.name.includes(q) || e.label.toLowerCase().includes(q));
    if (matches.length === 1) return { entry: matches[0] };
    if (matches.length === 0) return { error: `car : aucun v\xE9hicule \xAB ${query} \xBB (carlist pour voir la liste)` };
    const names = matches.slice(0, MAX_SUGGESTIONS).map((e) => e.name);
    return { error: `car : \xAB ${query} \xBB est ambigu : ${names.join(", ")}${matches.length > MAX_SUGGESTIONS ? "\u2026" : ""}` };
  }
  function getVehicle(id) {
    return id !== void 0 && mp.vehicles.exists(id) ? mp.vehicles.at(id) : null;
  }
  function occupants(vehicle) {
    const { driver, passenger, rearLeft, rearRight } = vehicle.seats;
    return [driver, passenger, rearLeft, rearRight].filter((p) => p !== null);
  }
  function forgetOwner(vehicleId) {
    for (const [playerId, id] of owned) if (id === vehicleId) owned.delete(playerId);
  }
  function destroyVehicle(vehicle, immediate = false) {
    const id = vehicle.id;
    if (pendingDestroy.has(id)) return;
    forgetOwner(id);
    const people = immediate ? [] : occupants(vehicle);
    const destroy = () => {
      pendingDestroy.delete(id);
      if (mp.vehicles.exists(id)) mp.vehicles.destroy(id);
    };
    if (people.length === 0) {
      destroy();
      return;
    }
    for (const person of people) person.emit(VehicleEvents.Leave);
    pendingDestroy.set(id, setTimeout(destroy, DESTROY_DELAY_MS));
  }
  function distance(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }
  function nearestVehicle(player, radius) {
    let best = null;
    let bestDistance = radius;
    for (const vehicle of mp.vehicles.toArray()) {
      if (vehicle.dimension !== player.dimension || pendingDestroy.has(vehicle.id)) continue;
      const d = distance(vehicle.position, player.position);
      if (d <= bestDistance) {
        best = vehicle;
        bestDistance = d;
      }
    }
    return best;
  }
  function allowedPlayer2(player, command) {
    if (!player) {
      info("vehicles", `${command} : commande \xE0 taper en jeu (F8), pas dans le terminal du serveur`);
      return null;
    }
    if (!canUse(player, getServerConfig().vehicles.allowAll)) {
      notify(player, `${command} : r\xE9serv\xE9 aux admins`);
      return null;
    }
    return player;
  }
  var UNKNOWN_POSITION = "le serveur ne conna\xEEt pas encore ta position : tape respawn puis r\xE9essaie";
  function spawnCar(player, args) {
    if (!hasKnownPosition(player)) {
      notify(player, `car : ${UNKNOWN_POSITION}`);
      return;
    }
    const resolved = resolveVehicle(args);
    if ("error" in resolved) {
      notify(player, resolved.error);
      return;
    }
    const { entry } = resolved;
    if (isInNoclip(player.id)) {
      notify(player, "car : quitte le noclip (F2) avant de faire appara\xEEtre un v\xE9hicule");
      return;
    }
    const current = player.vehicle;
    if (current && owned.get(player.id) !== current.id) {
      notify(player, "car : descends du v\xE9hicule avant d'en faire appara\xEEtre un");
      return;
    }
    const previous = getVehicle(owned.get(player.id));
    if (previous) destroyVehicle(previous, true);
    let vehicle;
    try {
      vehicle = mp.vehicles.create({
        model: mp.hashes.tweakdbid(entry.model),
        appearance: mp.hashes.cname(entry.appearance),
        position: player.position,
        yaw: player.yaw,
        dimension: player.dimension,
        // Toujours une vie, comme freeroam et l'exemple de la doc (guides/server/vehicles).
        health: getServerConfig().vehicles.health
      });
    } catch (err) {
      notify(player, `car : cr\xE9ation impossible (${errorText(err)})`);
      return;
    }
    owned.set(player.id, vehicle.id);
    player.emit(VehicleEvents.SeatIn, vehicle.id);
    notify(player, `car : ${entry.label}`);
    debug(
      "vehicles",
      `${player.nickname} (${player.id}) \u2192 ${entry.model} (#${vehicle.id}) \xE0 ${player.position.map((v) => v.toFixed(1)).join(" ")}, dimension ${player.dimension}`
    );
    if (isDebug()) scheduleSpawnCheck(vehicle.id);
  }
  function scheduleSpawnCheck(vehicleId) {
    setTimeout(() => {
      if (!mp.vehicles.exists(vehicleId)) {
        debug("vehicles", `#${vehicleId} : n'existe plus c\xF4t\xE9 serveur apr\xE8s 2 s (supprim\xE9 ?)`);
        return;
      }
      const v = mp.vehicles.at(vehicleId);
      debug(
        "vehicles",
        `#${vehicleId} apr\xE8s 2 s : vie ${v.health}, position ${v.position.map((n) => n.toFixed(1)).join(" ")}, dimension ${v.dimension}, rayon de streaming ${v.streamingRadius}`
      );
    }, 2e3);
  }
  function deleteVehicle(player) {
    if (!player.vehicle && !hasKnownPosition(player)) {
      notify(player, `dv : ${UNKNOWN_POSITION}`);
      return;
    }
    const vehicle = player.vehicle ?? nearestVehicle(player, DV_RADIUS);
    if (!vehicle || pendingDestroy.has(vehicle.id)) {
      notify(player, `dv : aucun v\xE9hicule (monte dedans ou approche-toi \xE0 moins de ${DV_RADIUS} m)`);
      return;
    }
    destroyVehicle(vehicle);
    notify(player, "dv : v\xE9hicule supprim\xE9");
    debug("vehicles", `${player.nickname} (${player.id}) a supprim\xE9 le v\xE9hicule #${vehicle.id}`);
  }
  function listCars(player, args) {
    const q = args[0]?.toLowerCase();
    const list = q === "untested" ? catalog.filter((e) => !e.tested) : q === "tested" ? catalog.filter((e) => e.tested) : q ? catalog.filter((e) => e.name.includes(q) || e.label.toLowerCase().includes(q) || e.category === q) : catalog;
    if (list.length === 0) {
      notify(player, `carlist : rien ne correspond \xE0 \xAB ${args[0]} \xBB`);
      return;
    }
    const lines = list.map(
      (e) => `${e.name.padEnd(28)} ${e.label}  [${e.category}]${e.tested ? "" : "  (non test\xE9)"}`
    );
    printLines(player, [`${list.length} v\xE9hicule(s) \u2014 car <nom> :`, ...lines]);
    notify(player, `carlist : ${list.length} v\xE9hicule(s), voir la console F8`);
  }
  var vehicles = {
    name: "vehicles",
    init() {
      loadCatalog();
      mp.commands.add("car", (caller, args) => {
        const player = allowedPlayer2(caller, "car");
        if (player) spawnCar(player, args);
      });
      mp.commands.add("dv", (caller) => {
        const player = allowedPlayer2(caller, "dv");
        if (player) deleteVehicle(player);
      });
      mp.commands.add("carlist", (caller, args) => {
        const player = allowedPlayer2(caller, "carlist");
        if (player) listCars(player, args);
      });
      mp.events.on("playerDisconnected", (playerId) => {
        const vehicle = getVehicle(owned.get(playerId));
        owned.delete(playerId);
        if (vehicle) destroyVehicle(vehicle);
      });
    },
    dispose() {
      for (const [id, timer] of pendingDestroy) {
        clearTimeout(timer);
        if (mp.vehicles.exists(id)) mp.vehicles.destroy(id);
      }
      pendingDestroy.clear();
      for (const id of owned.values()) if (mp.vehicles.exists(id)) mp.vehicles.destroy(id);
      owned.clear();
      mp.commands.remove("car");
      mp.commands.remove("dv");
      mp.commands.remove("carlist");
    }
  };

  // src/server/index.ts
  startModules([config, spawn, noclip, teleport, vehicles], (handler) => mp.events.on("resourceStop", handler), "mira_utils");
})();
/*! Bundled license information:

smol-toml/dist/error.js:
smol-toml/dist/primitive.js:
smol-toml/dist/date.js:
smol-toml/dist/extract.js:
smol-toml/dist/util.js:
smol-toml/dist/struct.js:
smol-toml/dist/parse.js:
smol-toml/dist/stringify.js:
smol-toml/dist/index.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)
*/
