<script>
	import {onMount, tick} from 'svelte'
	// import {Alert, Avatar, ListItem, Hamburger} from '$lib'
	import {Nav,Card, Container, Details, Icon, Field, Input,Button, Tag} from 'svelte-chota';
	// import {mdiHome,mdiMagnify, mdiDelete,mdiAccountPlus,mdiSend, mdiChevronDown } from '@mdi/js'
	// import {loading, users, session, times, sheets, holidays, cleanup, monthTotal, alert} from '$js/stores'
	// import {parseEntry, optional, plural, format, calcHours, mins, toInt, toHours} from "$js/formatter";

onMount(() => {
	return ()=>{ }
})

/*
class Holiday extends Model {
	static $name = 'holiday', $key='id';		// table is 'leave' in config.php
    static $fields = [
		[name=>'id',type=>'hidden'],
		[name=>'username',type=>'hidden'],
		[name=>'submitted',type=>'hidden'],
		[name=>'status',type=>'hidden'],
		[name=>'starting',type=>'date', rules=>'required',autoFocus=>true,],
		[name=>'ending',type=>'date', rules=>'required'],
		[name=>'days',type=>'number',rules=>'minvalue=1,maxvalue=365'],
		[name=>'type',type=>'radios',modifier=>'material',options=>
			['paid_leave', 'sick_leave', 'special_leave', 'unpaid_leave']
		],
		[name=>'reason'],
		[name=>'cover'],
	];

	static $summary = [
		[name=>'name'],
		[name=>'year'],
		[name=>'carry_over'],
		[name=>'entitlement'],
		[name=>'paid_leave'],
		[name=>'sick_leave'],
		[name=>'special_leave'],
		[name=>'unpaid_leave'],
		[name=>'compensation_days'],
		[name=>'compensation_used'],
		[name=>'remaining'],
	];

	function read($data){
		$table = self::table(); $name = self::$name; $key = static::$key;
		$user = Page::currentuser();

		// Collect totals for summary
		$rows = Times::read([month=>date('Y'),username=>$data[username]]);
		foreach ($rows[times] as $item)
			if ($type = $item[type]){
				$inc = -1;
				if ($type=='Weekend'){$type='compensation_days'; $inc = 1;}
				$totals[$type] += $item[days] ?: 1;
				$totals[remaining] += $item[days] ?: $inc;
			}

		foreach (self::$summary as $idx=>$item){
			switch ($item[name]){
				case 'name': self::$summary[$idx][value] = "$user[name] ($data[username])"; break;
				case 'year': self::$summary[$idx][value] = date('Y'); break;
				default: self::$summary[$idx][value] = $totals[$item[name]]; break;
			}
		}

		$rows = DB($table)->fetch_all('username',$data[username]);
		return [self::$name=>$rows, summary=>self::$summary, errors=>DB()->error()];
	}


	function Holidays(){
		$name = self::$name; $key = self::$key; $fields = self::$fields;
		self::listen($name);
		React::uses([Ajax,Sockets]);
		React::uses([Navbar,Fieldset,EditForm,SplitMenu],'Widgets');
		React::uses([Radio,Fab,ListHeader,ListTitle],'Onsen');
		$user = Page::currentuser();

		React('EditLeave','{navigator,user,item,fields,onClose=null}',"
			const doDelete = item.id ? data => {
				ons.notification.confirm('Are you sure you want to delete this item?')
				.then((response) => { if (response===1){
					ajax('del.$name',data).then( data=>{
						socket.emit('get.$name')
						if (onClose) onClose()
					})
				}})
			} : null

			const doSubmit = data => {		// todo: validate data
				ajax('edit.$name',data).then( data=>{
					socket.emit('get.$name')
					if (onClose) onClose()
				})
			}

			return <div>
				<EditForm fields={fields} defaults={item} doSubmit={doSubmit} doDelete={doDelete} doCancel={onClose}/>
			</div>
		")
		->props([fields=>$fields]);

		// Collect totals for summary
		$rows = Times::read([month=>date('Y'),username=>$user[username]]);
		foreach ($rows[times] as $item)
			if ($type = $item[type]){
				$inc = -1;
				if ($type=='Weekend'){$type='compensation_days'; $inc = 1;}
				$totals[$type] += $item[days] ?: 1;
				$totals[remaining] += $item[days] ?: $inc;
			}

		foreach (self::$summary as $idx=>$item){
			switch ($item[name]){
				case 'name': self::$summary[$idx][value] = "$user[name] ($user[username])"; break;
				case 'year': self::$summary[$idx][value] = date('Y'); break;
				default: self::$summary[$idx][value] = $totals[$item[name]]; break;
			}
		}


		React('Holidays','{navigator,username,user,totals,defaults}',"
			const [requests, setRequests] = useState([]);		// leave requests
			const [summary, setSummary] = useState([]);		// leave requests


			useEffect(() => {
				ajax('get.$name',{username,summary:1}).then(data => {
					console.log({data})
					setRequests(data.holiday)
					setSummary(data.summary)
					//const projects = data.projects.map( p => {return {value: p.id, label: p.project }} )
				} )
			}, [username])

			const onClose = e => navigator.popPage()

			const onSelect = item => navigator.pushPage({
				content:EditLeave, key:'edit.$name', props:{item, user, onClose}, title:'Leave Request', hasBackButton:true
			})

			return <Fragment>
				<Card>{
					summary.map( (item,idx) => {
						const label = capitalize(item.name.replace('_',' '))
						return item.value ? <Row key={idx}>
							<Col style={{maxWidth:180, whiteSpace:'nowrap'}}>{label}:</Col>
							<Col className='right'>{item.value}</Col><Col/>
						</Row> : null
					})
				}</Card>


				<ListTitle>Leave Requests</ListTitle>
				<Card>
				<FetchData url='?ajax=get.$name' data={{username}} loading error empty field='$name' map={ (row,idx) =>
					<ListItem key={row.id} tappable onClick={e=>onSelect(row)} modifier='chevron'>
						<div className='left'><span className='list-item__icon' style={{fontSize: 14}}>{row.days} days</span></div>
						<div className='center'>
							<span className='list-item__title'>{capitalize(row.type.replace('_',' '))} {row.reason}</span>
							<span className='list-item__subtitle'>{row.starting} - {row.ending}</span>
						</div>
						<div className='right'>
							{row.status}
						</div>
					</ListItem>
				} />
				</Card>

				<Fab position='bottom right' onClick={e=>onSelect(defaults)}><Icon icon='md-plus'/></Fab>

			</Fragment>
		")->props([totals=>self::$summary,
			defaults=>[
				username=>$user[username], status =>'pending', days =>1, type => 'paid_leave',
				submitted=>date('Y-m-d'), starting=>date('Y-m-d'), ending=>date('Y-m-d'),
			]
		]);
	}

*/



</script>

<Container>
	<Card>
		<Details class="mb-5" open>
			<span slot="summary">Notes</span>
			<h5 class='center'>Notes regarding leave requests</h5>
			<ol>
				<li>Please do not book any holidays until all approvals have been obtained.</li>
				<li>At least 5 working days notice is needed for paid leave. In other cases please
					submit the request as soon as possible.</li>
				<li>If you wish to change any of your dates for leave please submit a new request.</li>
				<li>When the client you are working at is closed on a day other than a national holiday
					or weekend, submit a request for a client holiday. These days do not require signed
					approval and will not be deducted from your yearly paid leave.</li>
				<li>Days Remaining indicates the number of days remaining to the end of
					the calendar year (December 30th), assuming that the employee will work up to
					the last working day in that year. If the employee leaves the company
					for any reason prior to December 30th, then the remaining holidays will be prorated
					by the number of months worked in that year. (i.e. Prorated Unused Days Remaining
					= Unused Days Remaining x Number of months work in that year / 12 months).</li>
			</ol>
		</Details>
	</Card>
</Container>

<style>
	ol {list-style:auto;}
	li {margin: 12px 20px; line-height: 1.2; }
</style>
