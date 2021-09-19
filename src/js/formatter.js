const formats = {}

const default_options = {
	style: "decimal",				// "currency" || "decimal",
	currency: "JPY",
	locale: 'ja-JP',
	zero: false,					// show 0 || '' || '-'; Not a NumberFormat option!
	useGrouping: true,
	minimumFractionDigits: 0,		// maximumSignificantDigits: 3,
};
export function plural(d,type='day'){ return type ? (d + type + (Math.abs(d)==1 ? '' : 's')) : d;}
export function format(val, fmt='text'){
	var format = formats[fmt];
	try {
		if (format && typeof format.formatter==='function') return format.formatter(val, format.options)
		console.error('MyErr: Undefined format or format.formatter: ', fmt, format)
	}
	catch {
		console.error('invalid',val,fmt)
	}
	return val
}

export function setFormat(fmt, settings, formatter){		// console.log('set format',{fmt,settings, formatter})
	const options = { ...default_options, ...settings };	// merge options and init formatter
	formatter = formatter || formatNumber
	formats[fmt] = { options, formatter};
}

setFormat("number", { style: "decimal", zero:'0' });
setFormat('short',{},val=>{		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
	const d = new Date(val)
	// return new Intl.DateTimeFormat('default', { weekday:'short', day:'numeric' }).format(d)
	const wd = new Intl.DateTimeFormat('en', { weekday:'short' }).format(d)
	const ye = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(d)
	const mo = new Intl.DateTimeFormat('en', { month: 'short' }).format(d)
	const da = new Intl.DateTimeFormat('en', { day: 'numeric' }).format(d)
	// const da = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(d)
	// console.log(`${da}-${mo}-${ye}`)
	return `${da} ${wd}`;
})
setFormat('month',{},val=>{		// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
	const d = new Date(val)
	const ye = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(d)
	const mo = new Intl.DateTimeFormat('en', { month: 'short' }).format(d)
	return `${mo} ${ye}`;
})

// setFormat("price", { style: "decimal", zero:'0' });
// setFormat("margin", { style: "decimal", zero:'0' });
// setFormat("decimal_0", { style: "decimal", zero:'0' });
// setFormat("decimal_dash", { style: "decimal", zero:'-' });
// setFormat("currency", { style: "currency" });
// setFormat("text", { style: null }, val=> val===undefined ? "" : val );
// setFormat("date", {}, val => val===undefined ? "" : val.substring(5,10) );

function formatNumber(val, options){
	const formatter = new Intl.NumberFormat(options.locale, options)
	let number = ("" + val).trim();
	if (val===undefined) return "";
	if ((number === "0" || number === "") && options.zero) return options.zero;
	return formatter.format(+number);
}


export function round(v){ return Math.round(v*100 + 0.49) / 100; }
export function toInt(num){ return num ? +num : 0; }
export function toHours(mins){ return round(mins/60); }
export function optional(val, prefix='', postfix=''){ return val ? prefix + plural(val,postfix) : '' }
export function calcHours(time){
	var start = mins(time.start ?? "00:00"), end = mins(time.finish ?? "00:00"), less = toInt(time.breaks ?? 0) * 60
	return toHours(end-start-less)
}
export function mins(time){		// convert string 'mm:nn' to minutes
	var [h,m] = time ? time.split(':').map(v=>+v) : [0,0];
	return h*60 + m;
}
export function parseEntry(time, holidays){		// parse a time entry object into standard and overtime hours
	var t1 = 0, t2 = 0, t3 = 0
	var date = new Date(time.date)
	var dow = time ? new Intl.DateTimeFormat('en', { weekday:'short' }).format(date) : null
	var start = mins(time.start), end = mins(time.finish)
	var less = toInt(time.breaks) * 60
	t1 = start<mins("05:00") ? (end<mins("5:00") ? end-start : mins("5:00")-start) : 0;	// 00:00-04:59
	if ( (start>=mins("5:00") || end>=mins("5:00")) && (start<mins("22:00") || end<mins("22:00"))){	// 05:00-21:59
		if (start<mins("5:00")){
			if (end<mins("22:00")) t2 = end-mins("5:00");
			else t2 = mins("17:00");
		}
		else {
			if (end<mins("22:00")) t2 = end-start;
			else t2 = mins("22:00")-start;
		}
	}
	if (start>=mins("22:00") && end<mins("24:00")){										// 22:00-23:59
		t3 = end-start;
	} else {
		if      (start>=mins("22:00"))	t3 = mins("24:00")-start;
		else if (end>=mins("22:00"))	t3 = end-mins("22:00");
	}

	var stdhours = 8						// todo get std hours from user settings
	var holiday = holidays[time.date];		// public/national holiday
	var weekday = dow=='Sun' || holiday ? false : true
	var required = weekday ? stdhours : (time.type=='half-day' ? stdhours/2 : 0)
	var short = format(time.date,'short')

	var a = ( weekday && t2-less > required * 60) ? t2-less - required/24 : 0;
	var b = (!weekday && t2-less > required * 60) ? t2-less - required/24 : 0;
	var c =   weekday && (t1>0 || t3>0) ? t1+t3 : 0;
	var d =  !weekday && (t1>0 || t3>0) ? t1+t3 : 0;
	var days = end-start-less >= 60 ? 1:0;

	var total =  end-start-less
	if (isNaN(total)) total = 0
	if (isNaN(b)) console.log({b,weekday,t2,less,required})
	// const customerCity = customer?.city ?? "Unknown city";

	// Rate A	Between 5am & 10pm, Monday to Saturday
	// Rate B	Between 5am & 10pm, Sunday & National Holiday
	// Rate C	Between 10pm & 5am, Monday to Saturday
	// Rate D	Between 10pm & 5am, Sunday & National Holiday

	return {
		...time,
		days:	days,
		hours:	toHours(end-start-less),
		total:	toHours(total),
		a:		toHours(a),
		b:		toHours(b),
		c:		toHours(c),
		d:		toHours(d),
		breaks:	toInt(time.breaks),
		color:	weekday ? (dow=='Sat' ? 'blue' : null) : 'red',
		holiday,
		short,					// short day (d dow)
	}
}
