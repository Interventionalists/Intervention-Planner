"""In-memory stand-in for the supabase-py PostgREST client.

Implements only the builder methods supabase_client.py uses, and actually
applies every filter, so the backend's own school/owner scoping is exercised.
Unknown methods raise, so a filter can never be silently ignored.
"""
import copy
import itertools


class _Resp:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _Query:
    def __init__(self, db, table):
        self.db, self.table = db, table
        self.op, self.payload = "select", None
        self.filters, self.cols, self.count = [], "*", None
        self._limit, self._range, self._order = None, None, None

    # ---- verbs
    def select(self, cols="*", count=None):
        if self.op == "select":
            self.cols, self.count = cols, count
        else:
            self.cols = cols  # returning projection on update/insert
        return self

    def update(self, payload):
        self.op, self.payload = "update", payload
        return self

    def insert(self, payload):
        self.op, self.payload = "insert", payload
        return self

    def upsert(self, payload, **_):
        self.op, self.payload = "upsert", payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    # ---- filters
    def _f(self, fn):
        self.filters.append(fn)
        return self

    def eq(self, c, v):  return self._f(lambda r: str(r.get(c)) == str(v) if not isinstance(v, bool) else r.get(c) is v)
    def neq(self, c, v): return self._f(lambda r: str(r.get(c)) != str(v))
    def is_(self, c, v): return self._f(lambda r: r.get(c) is None if v in ("null", None) else r.get(c) == v)
    def in_(self, c, vs):
        s = {str(v) for v in vs}
        return self._f(lambda r: str(r.get(c)) in s)
    def gt(self, c, v):  return self._f(lambda r: r.get(c) is not None and str(r[c]) > str(v))
    def gte(self, c, v): return self._f(lambda r: r.get(c) is not None and str(r[c]) >= str(v))
    def lt(self, c, v):  return self._f(lambda r: r.get(c) is not None and str(r[c]) < str(v))
    def lte(self, c, v): return self._f(lambda r: r.get(c) is not None and str(r[c]) <= str(v))
    def like(self, c, pat):
        prefix = pat.rstrip("%")
        return self._f(lambda r: str(r.get(c, "")).startswith(prefix))

    def order(self, c, desc=False):
        self._order = (c, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def range(self, a, b):
        self._range = (a, b)
        return self

    def __getattr__(self, name):
        raise NotImplementedError(f"fake supabase: .{name}() not implemented")

    # ---- execution
    def _match(self, rows):
        return [r for r in rows if all(f(r) for f in self.filters)]

    def _project(self, rows):
        if self.cols == "*" or "(" in self.cols:
            return [copy.deepcopy(r) for r in rows]
        keys = [c.strip() for c in self.cols.split(",")]
        return [{k: r.get(k) for k in keys} for r in rows]

    def execute(self):
        rows = self.db.tables.setdefault(self.table, [])
        if self.op == "select":
            out = self._match(rows)
            total = len(out)
            if self._order:
                c, d = self._order
                out = sorted(out, key=lambda r: str(r.get(c)), reverse=d)
            if self._range:
                out = out[self._range[0]: self._range[1] + 1]
            if self._limit is not None:
                out = out[: self._limit]
            return _Resp(self._project(out), total if self.count else None)
        if self.op in ("insert", "upsert"):
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            created = []
            for item in items:
                row = {"id": next(self.db.ids), **item}
                rows.append(row)
                created.append(row)
            self.db.log.append((self.op, self.table, created))
            return _Resp(self._project(created))
        if self.op == "update":
            hit = self._match(rows)
            for r in hit:
                r.update(self.payload)
            self.db.log.append(("update", self.table, hit))
            return _Resp(self._project(hit))
        if self.op == "delete":
            hit = self._match(rows)
            for r in hit:
                rows.remove(r)
            self.db.log.append(("delete", self.table, hit))
            return _Resp(self._project(hit))
        raise AssertionError(self.op)


class _Rpc:
    def __init__(self, db, fn, args):
        self.db, self.fn, self.args = db, fn, args

    def execute(self):
        assert self.fn == "record_login_attempt"
        user = next(u for u in self.db.tables["users"] if u["id"] == self.args["p_user_id"])
        if self.args["p_success"]:
            user.update(failed_login_attempts=0, locked_until=None)
        else:
            user["failed_login_attempts"] = (user.get("failed_login_attempts") or 0) + 1
            if user["failed_login_attempts"] >= self.args["p_max_attempts"]:
                user["locked_until"] = "2999-01-01T00:00:00+00:00"
        return _Resp([{"failed_login_attempts": user["failed_login_attempts"],
                       "locked_until": user.get("locked_until")}])


class FakeSupabase:
    def __init__(self, tables):
        self.tables = copy.deepcopy(tables)
        self.ids = itertools.count(50_000)
        self.log = []

    def table(self, name):
        return _Query(self, name)

    def rpc(self, fn, args):
        return _Rpc(self, fn, args)
