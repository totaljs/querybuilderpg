// Total.js Module: PostgreSQL integrator

const CANSTATS = global.F ? (global.F.stats && global.F.stats.performance && global.F.stats.performance.dbrm != null) : false;
const Pg = require('pg');
const REG_PG_ESCAPE_1 = /'/g;
const REG_PG_ESCAPE_2 = /\\/g;
const REG_LANGUAGE = /[a-z0-9]+§/gi;
const LOGGER = '-- PostgreSQL -->';
const POOLS = {};

function exec(client, filter, callback, done, errorhandling) {

	var cmd;

	if (filter.exec === 'list') {
		cmd = makesql(filter);

		if (filter.debug)
			console.log(LOGGER, cmd.query, cmd.params);

		client.query(cmd.query, cmd.params, function(err, response) {
			if (err) {
				done();
				errorhandling && errorhandling(err, cmd);
				callback(err);
			} else {
				cmd = makesql(filter, 'count');

				if (filter.debug)
					console.log(LOGGER, cmd.query, cmd.params);

				client.query(cmd.query, cmd.params, function(err, counter) {
					done();
					err && errorhandling && errorhandling(err, cmd);
					callback(err, err ? null : { items: response.rows, count: +counter.rows[0].count });
				});
			}
		});
		return;
	}

	cmd = makesql(filter);

	if (filter.debug)
		console.log(LOGGER, cmd.query, cmd.params);

	client.query(cmd.query, cmd.params, function(err, response) {

		done();

		if (err) {
			errorhandling && errorhandling(err, cmd);
			callback(err);
			return;
		}

		switch (filter.exec) {
			case 'insert':
				callback(null, filter.primarykey ? response.rows.length && response.rows[0][filter.primarykey] : response.rowCount);
				break;
			case 'update':
				callback(null, response.rows[0] ? (response.rows[0].count || 0) : 0);
				break;
			case 'remove':
				callback(null, response.rowCount);
				break;
			case 'check':
				callback(null, response.rows[0] ? response.rows[0].count > 0 : false);
				break;
			case 'count':
				callback(null, response.rows[0] ? response.rows[0].count : null);
				break;
			case 'scalar':
				if (filter.scalar.type === 'group')
					callback(null, response.rows);
				else
					callback(null, response.rows[0] ? response.rows[0].value : null);
				break;
			default:
				callback(err, response.rows);
				break;
		}
	});
}

function pg_where(where, opt, filter, operator) {

	var tmp;

	for (var item of filter) {

		if (opt.language != null && item.name && item.name[item.name.length - 1] === '§')
			item.name = item.name.substring(0, item.name.length - 1) + opt.language;

		switch (item.type) {
			case 'or':
				tmp = [];
				pg_where(tmp, opt, item.value, 'OR');
				where.length && where.push(operator);
				where.push('(' + tmp.join(' ') + ')');
				break;
			case 'in':
			case 'notin':
				where.length && where.push(operator);
				tmp = [];
				if (item.value instanceof Array) {
					for (var val of item.value) {
						if (val != null)
							tmp.push(PG_ESCAPE(val));
					}
				} else if (item.value != null)
					tmp = [PG_ESCAPE(item.value)];
				if (!tmp.length)
					tmp.push('null');
				where.push(item.name + (item.type === 'in' ? ' IN ' : ' NOT IN ') + '(' + tmp.join(',') + ')');
				break;
			case 'query':
				where.length && where.push(operator);
				where.push('(' + item.value + ')');
				break;
			case 'where':
				where.length && where.push(operator);
				if (item.value == null)
					where.push(item.name + (item.comparer === '=' ? ' IS NULL' : ' IS NOT NULL'));
				else
					where.push(item.name + item.comparer + PG_ESCAPE(item.value));
				break;
			case 'contains':
				where.length && where.push(operator);
				where.push('LENGTH(' + item.name +'::text)>0');
				break;
			case 'search':
				where.length && where.push(operator);
				tmp = item.value.replace(/%/g, '');
				if (item.operator === 'beg')
					where.push(item.name + ' ILIKE ' + PG_ESCAPE('%' + tmp));
				else if (item.operator === 'end')
					where.push(item.name + ' ILIKE ' + PG_ESCAPE(tmp + '%'));
				else
					where.push(item.name + ' ILIKE ' + PG_ESCAPE('%' + tmp + '%'));
				break;
			case 'month':
			case 'year':
			case 'day':
			case 'hour':
			case 'minute':
				where.length && where.push(operator);
				where.push('EXTRACT(' + item.type + ' from ' + item.name + ')' + item.comparer + PG_ESCAPE(item.value));
				break;
			case 'empty':
				where.length && where.push(operator);
				where.push('(' + item.name + ' IS NULL OR LENGTH(' + item.name + '::text)=0)');
				break;
			case 'between':
				where.length && where.push(operator);
				where.push('(' + item.name + ' BETWEEN ' + PG_ESCAPE(item.a) + ' AND ' + PG_ESCAPE(item.b) + ')');
				break;
		}
	}
}

function pg_insertupdate(filter, insert) {

	var query = [];
	var fields = insert ? [] : null;
	var params = [];

	for (var key in filter.payload) {
		var val = filter.payload[key];

		if (val === undefined)
			continue;

		var c = key[0];
		switch (c) {
			case '-':
			case '+':
			case '*':
			case '/':
				key = key.substring(1);
				params.push(val ? val : 0);
				if (insert) {
					fields.push('"' + key + '"');
					query.push('$' + params.length);
				} else
					query.push('"' + key + '"=COALESCE(' + key + ',0)' + c + '$' + params.length);
				break;
			case '>':
			case '<':
				key = key.substring(1);
				params.push(val ? val : 0);
				if (insert) {
					fields.push('"' + key + '"');
					query.push('$' + params.length);
				} else
					query.push('"' + key + '"=' + (c === '>' ? 'GREATEST' : 'LEAST') + '(' + key + ',$' + params.length + ')');
				break;
			case '!':
				// toggle
				key = key.substring(1);
				if (insert) {
					fields.push('"' + key + '"');
					query.push('FALSE');
				} else
					query.push('"' + key + '"=NOT ' + key);
				break;
			case '=':
			case '#':
				// raw
				key = key.substring(1);
				if (insert) {
					if (c === '=') {
						fields.push('"' + key + '"');
						query.push(val);
					}
				} else
					query.push('"' + key + '"=' + val);
				break;
			default:
				params.push(val);
				if (insert) {
					fields.push('"' + key + '"');
					query.push('$' + params.length);
				} else
					query.push('"' + key + '"=$' + params.length);
				break;
		}
	}

	return { fields, query, params };
}

function replacelanguage(fields, language, noas) {
	return fields.replace(REG_LANGUAGE, function(val) {
		val = val.substring(0, val.length - 1);
		return val + (noas ? language : (language ? (language + ' as ' + val) : ''));
	});
}

function makesql(opt, exec) {

	var query = '';
	var where = [];
	var model = {};
	var isread = false;
	var params;
	var index;
	var tmp;

	if (!exec)
		exec = opt.exec;

	pg_where(where, opt, opt.filter, 'AND');

	if (opt.language != null && opt.fields)
		opt.fields = replacelanguage(opt.fields.join(','), opt.language);

	switch (exec) {
		case 'find':
		case 'read':
			query = 'SELECT ' + (opt.fields || '*') + ' FROM ' + opt.table + (where.length ? (' WHERE ' + where.join(' ')) : '');
			isread = true;
			break;
		case 'list':
			query = 'SELECT ' + (opt.fields || '*') + ' FROM ' + opt.table + (where.length ? (' WHERE ' + where.join(' ')) : '');
			isread = true;
			break;
		case 'count':
			opt.first = true;
			query = 'SELECT COUNT(1)::int as count FROM ' + opt.table + (where.length ? (' WHERE ' + where.join(' ')) : '');
			isread = true;
			break;
		case 'insert':
			tmp = pg_insertupdate(opt, true);
			query = 'INSERT INTO ' + opt.table + ' (' + tmp.fields.join(',') + ') VALUES(' + tmp.query.join(',') + ')' + (opt.primarykey ? ' RETURNING ' + opt.primarykey : '');
			params = tmp.params;
			break;
		case 'remove':
			query = 'DELETE FROM ' + opt.table + (where.length ? (' WHERE ' + where.join(' ')) : '');
			break;
		case 'update':
			tmp = pg_insertupdate(opt);
			query = 'WITH rows AS (UPDATE ' + opt.table + ' SET ' + tmp.query.join(',') + (where.length ? (' WHERE ' + where.join(' ')) : '') + ' RETURNING 1) SELECT COUNT(1)::int count FROM rows';
			params = tmp.params;
			break;
		case 'check':
			query = 'SELECT 1 as count FROM ' + opt.table + (where.length ? (' WHERE ' + where.join(' ')) : '');
			isread = true;
			break;
		case 'drop':
			query = 'DROP TABLE ' + opt.table;
			break;
		case 'truncate':
			query = 'TRUNCATE TABLE ' + opt.table + ' RESTART IDENTITY';
			break;
		case 'command':
			break;
		case 'scalar':
			switch (opt.scalar.type) {
				case 'avg':
				case 'min':
				case 'sum':
				case 'max':
				case 'count':
					opt.first = true;
					var val = opt.scalar.key === '*' ? 1 : opt.scalar.key;
					query = 'SELECT ' + opt.scalar.type.toUpperCase() + (opt.scalar.type !== 'count' ? ('(' + val + ')') : '(1)') + '::numeric as value FROM ' + opt.table + (where.length ? (' WHERE ' + where.join(' ')) : '');
					break;
				case 'group':
					query = 'SELECT ' + opt.scalar.key + ', ' + (opt.scalar.key2 ? ('SUM(' + opt.scalar.key2 + ')::numeric') : 'COUNT(1)::int') + ' as value FROM ' + opt.table + (where.length ? (' WHERE ' + where.join(' ')) : '') + ' GROUP BY ' + opt.scalar.key;
					break;
			}
			isread = true;
			break;
		case 'query':
			query = opt.query + (where.length ? (' WHERE ' + where.join(' ')) : '');
			isread = true;
			break;
	}

	if (exec === 'find' || exec === 'read' || exec === 'list' || exec === 'query' || exec === 'check') {

		if (opt.sort) {

			tmp = '';

			for (var i = 0; i < opt.sort.length; i++) {
				var item = opt.sort[i];
				index = item.lastIndexOf('_');
				tmp += (i ? ', ' : ' ') + item.substring(0, index) + ' ' + (item.substring(index + 1) === 'desc' ? 'DESC' : 'ASC');
			}

			if (opt.language != null)
				tmp = replacelanguage(tmp, opt.language, true);

			query += ' ORDER BY' + tmp;
		}

		if (opt.take && opt.skip)
			query += ' LIMIT ' + opt.take + ' OFFSET ' + opt.skip;
		else if (opt.take)
			query += ' LIMIT ' + opt.take;
		else if (opt.skip)
			query += ' OFFSET ' + opt.skip;
	}

	model.query = query;
	model.params = params;

	if (CANSTATS) {
		if (isread)
			F.stats.performance.dbrm++;
		else
			F.stats.performance.dbwm++;
	}

	return model;
}

function PG_ESCAPE(value) {

	if (value == null)
		return 'null';

	var type = typeof(value);

	if (type === 'function') {
		value = value();
		if (value == null)
			return 'null';
		type = typeof(value);
	}

	if (type === 'boolean')
		return value === true ? 'true' : 'false';

	if (type === 'number')
		return value + '';

	if (type === 'string')
		return pg_escape(value);

	if (value instanceof Array)
		return pg_escape(value.join(','));

	if (value instanceof Date)
		return pg_escape(dateToString(value));

	return pg_escape(value.toString());
}

// Author: https://github.com/segmentio/pg-escape
// License: MIT
function pg_escape(val) {
	if (val == null)
		return 'NULL';
	var backslash = ~val.indexOf('\\');
	var prefix = backslash ? 'E' : '';
	val = val.replace(REG_PG_ESCAPE_1, '\'\'').replace(REG_PG_ESCAPE_2, '\\\\');
	return prefix + '\'' + val + '\'';
}

function dateToString(dt) {

	var arr = [];

	arr.push(dt.getFullYear().toString());
	arr.push((dt.getMonth() + 1).toString());
	arr.push(dt.getDate().toString());
	arr.push(dt.getHours().toString());
	arr.push(dt.getMinutes().toString());
	arr.push(dt.getSeconds().toString());

	for (var i = 1; i < arr.length; i++) {
		if (arr[i].length === 1)
			arr[i] = '0' + arr[i];
	}

	return arr[0] + '-' + arr[1] + '-' + arr[2] + ' ' + arr[3] + ':' + arr[4] + ':' + arr[5];
}

Pg.types.setTypeParser(1700, val => val == null ? null : +val);
global.PG_ESCAPE = PG_ESCAPE;

exports.init = function(name, connstring, pooling, errorhandling) {

	if (!name)
		name = 'default';

	if (pooling)
		pooling = +pooling;

	if (!connstring) {
		if (POOLS[name]) {
			POOLS[name].end();
			delete POOLS[name];
		}

		// Removes instance
		NEWDB(name, null);
		return;
	}

	NEWDB(name, function(filter, callback) {
		if (pooling) {
			var pool = POOLS[name] || (POOLS[name] = new Pg.Pool({ connectionString: connstring, max: pooling }));
			pool.connect(function(err, client, done) {
				if (err)
					callback(err);
				else
					exec(client, filter, callback, done, errorhandling);
			});
		} else {
			var client = new Pg.Client({ connectionString: connstring });
			client.connect(function(err, client) {
				if (err)
					callback(err);
				else
					exec(client, filter, callback, () => client.end(), errorhandling);
			});
		}
	});
};