const FILTER = 'fields:[*id,type:{min|max|sum,count}],group:[string],filter:[*id,*type,*value],sort:[*id,type:{asc|desc}],take:number,skip:number,page:number,limit:number'.toJSONSchema();
exports.views = [];

function View(data) {
	for (var key in data)
		this[key] = data[key];
	this.cache = {};
	for (let m of this.fields)
		this.cache[m.id] = m;
}

function alias(m) {
	return m.as ? (' AS ' + m.as) : '';
}

function parse(type, value) {

	var t = typeof(type);

	switch(type) {

		case 'string':
			return t === 'string' ? value : '';

		case 'boolean':

			if (t === 'boolean')
				return value;

			if (t === 'string') {
				let tmp = value.toLowerCase();
				return tmp === '1' || tmp === 'true' || tmp === 'yes' || tmp === 'ok' || tmp === 'on';
			}

			return false;

		case 'number':

			if (t === 'number')
				return value;

			if (t === 'string')
				return value.parseFloat();

			return 0;

		case 'date':

			if (value instanceof Date)
				return value;

			if (t === 'string') {

				if (t === 'now')
					return NOW;

				return value.trim().parseDate('yyyy-MM-dd HH:mm:ss');
			}

			if (t === 'number')
				return new Date(value);

			return null;
	}

	return null;
}

View.prototype.export = function() {
	var t = this;
	var obj = {};
	obj.id = t.id;
	obj.name = t.name;
	obj.icon = t.icon;
	obj.color = t.color;
	obj.fields = [];
	for (var f of t.fields)
		obj.fields.push({ id: f.id, name: f.name, icon: f.icon, color: f.color, type: f.type });
	return obj;
};

View.prototype.remove = function() {
	var t = this;
	var index = exports.views.findIndex('id', t.id);
	if (index !== -1)
		exports.views.splice(index, 1);
	t.fields = null;
	t.cache = null;
};

View.prototype.exec = function(query, callback) {

	var filter = FILTER.transform(query);
	var data = filter.response;

	// data.fields {Array}
	// data.filter {Array}
	// data.group  {Array}
	// data.sort   {Array}
	// data.limit  {Number}

	var t = this;
	var fields = [];
	var group = [];
	var where = [];
	var relations = [];
	var sort = [];
	var cache = [];
	var having = [];
	var scalar = {};

	if (data.fields) {

		if (data.group) {
			for (let m of data.group) {
				let field = t.fields.findItem('id', m);
				if (field) {
					cache.push(field.id);
					fields.push(field.column + alias(field));
				}
			}
		}

		for (let m of data.fields) {
			let field = t.cache[m.id];
			if (field) {
				if (data.group) {
					let tmp = '{0}({1}){2}';
					if (m.type) {
						cache.push(field.id);
						fields.push(tmp.format(m.type.toUpperCase(), field.column, alias(field)));
						scalar[field.id] = '{0}({1})'.format(m.type.toUpperCase(), field.column);
					}
				} else {
					cache.push(field.id);
					fields.push(field.column + alias(field));
				}
			}
		}

	} else {
		if (data.group) {
			for (let m of data.group) {
				let field = t.cache[m];
				if (field) {
					cache.push(field.id);
					fields.push(field.column + alias(field));
				}
			}
		} else {
			for (let m of t.fields) {
				cache.push(m.id);
				fields.push(m.column + alias(m));
			}
		}
	}

	if (data.filter) {
		for (let m of data.filter) {
			let field = t.cache[m.id];
			let tmp;
			let arr;

			if (field) {

				if (m.type === '!=')
					m.type = '<>';

				switch (m.type) {
					case 'search':
						where.push(field.column + ' ILIKE ' + PG_ESCAPE('%' + parse(field.type, m.value) + '%'));
						break;
					case 'in':
						tmp = m.value.split(',');
						arr = [];
						for (var v of tmp)
							arr.push(PG_ESCAPE(parse(field.type, v)));
						if (arr.length)
							where.push(field.column + ' IN (' + arr.join(',') + ')');
						break;
					case 'between':
						tmp = m.value.split(' - ');
						if (data.group && scalar[m.id])
							having.push('(' + scalar[m.id] + ' BETWEEN ' + PG_ESCAPE(parse(field.type, tmp[0])) + ' AND ' + PG_ESCAPE(parse(field.type, tmp[1])) + ')');
						else
							where.push('(' + field.column + ' BETWEEN ' + PG_ESCAPE(parse(field.type, tmp[0])) + ' AND ' + PG_ESCAPE(parse(field.type, tmp[1])) + ')');
						break;
					case '=':
					case '>':
					case '<':
					case '>=':
					case '<>':
					case '<=':
						if (data.group && scalar[m.id])
							having.push(scalar[m.id] + m.type + PG_ESCAPE(parse(field.type, m.value)));
						else
							where.push(field.column + m.type + PG_ESCAPE(parse(field.type, m.value)));
						break;
					default:
						continue;
				}
			}
		}
	}

	if (data.group) {
		for (let m of data.group) {
			let field = t.cache[m];
			group.push(field.column);
		}
	}

	if (data.sort) {
		for (let m of data.sort) {
			let index = cache.indexOf(m.id);
			if (index !== -1)
				sort.push(index + 1 + ' ' + (m.type === 'desc' ? 'DESC' : 'ASC'));
		}
	}

	if (data.limit)
		data.take = data.limit;

	if (data.page)
		data.skip = (data.page - 1) * data.take;

	for (let m of t.relations)
		relations.push(m.type + ' JOIN ' + m.id + ' ON ' + m.on);

	var sqlbefore = 'SELECT ' + fields.join(',');
	var sql = ' FROM ' + t.from;

	if (relations.length)
		sql += (relations.length ? (' ' + relations.join(' ')) : '');

	if (where.length)
		sql += ' WHERE ' + where.join(' AND ');

	if (group.length)
		sql += ' GROUP BY ' + group.join(',');

	if (having.length)
		sql += ' HAVING ' + having.join(' AND ');

	var db = DB();

	db.debug();

	if (data.skip != null) {
		db.query('SELECT COUNT(1)::int4 AS count' + sql).first().callback(function(err, response) {
			var count = response.count;

			if (sort.length)
				sql += ' ORDER BY ' + sort.join(',');

			sql += ' LIMIT ' + data.take + ' OFFSET ' + data.skip;

			db.query(sqlbefore + sql).callback(function(err, response) {
				response = { items: response };
				response.count = count;
				response.limit = data.take;
				response.pages = Math.ceil(count / data.take);
				response.page = (data.skip / data.take) + 1;
				callback(err, response);
			});
		});
	} else {

		if (sort.length)
			sql += ' ORDER BY ' + sort.join(',');

		if (data.take)
			sql += ' LIMIT ' + data.take;

		db.query(sqlbefore + sql).callback(callback);
	}
};

exports.create = function(data) {
	var views = exports.views;
	var item = new View(data);
	var index = views.findIndex('id', item.id);
	if (index === -1)
		views.push(item);
	else
		views[index] = item;
	return item;
};

exports.export = function() {
	var t = this;
	var arr = [];
	for (let m of t.views)
		arr.push(m.export());
	return arr;
};

exports.read = function(id) {
	return exports.views.findItem('id', id);
};

exports.remove = function(id) {
	var view = exports.views.findItem('id', id);
	if (view) {
		view.remove();
		return true;
	}
};