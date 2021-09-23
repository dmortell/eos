
/*

React('Timesheet','{id,username,projects,navigator}',"
	const [project, saveDefaultProject] = useLocalStorage('project'+username, 0);	// key, default
	const defaults = {username, project, date:date('Y-m-d'),start:'09:00',finish:'18:00',less:'01:00:00'}
	const [open, setOpen] = useState(id ? false:true)
	const [values, setData] = useState(defaults)
	const [status,refresh] = useAjax({url:'get.timesheets',args:{id}}), data = id ? status.data : {timesheet:{month:date('Y-m')},times:[]}

	//const state = useStoreState()			//const [state, dispatch] = useStore()
	//objIndex = myArray.findIndex((obj => obj.id == 1));
	//const newState = state.map(obj => obj.id === '101' ? { ...obj, completed: true } : obj );


	const projectName = id => {
		for (var i in projects) if (projects[i].value == id) return projects[i].label
		return null
	}

	if (!data && id) return <Card><LoadingStatus status={status} /></Card>
	var total = 0, days = [], rows = [], {times,timesheet} = data
	var month = new Month(timesheet.month)

	for (var d=1; d<=month.days; d++)		// list of days in the month
		days[d] = {day:d, type:'weekday', items:[], date:new Month(timesheet.month + '-' + d)}

	data.times.map( item => {				// fill each days with time entries
		const month = new Month(item.date), day = month.day
		const duration = getDuration(item); total += duration
		days[day].items.push(item)
	})
	if (+timesheet.total !== total){		// update the timesheet total if an entry is edited
		ajax('edit.$name',{id,total})
		timesheet.total = total
	}

	const onSubmit = data => {				// data is null if Cancel is clicked, or true if entry is deleted
		if (data){
			if (data!==true) saveDefaultProject(data.project)
			refresh({emit:true})			// refresh timesheets
		}
		navigator.popPage()
	}

	// const onSubmit = data => {
	// 	navigator.popPage();
	// 	setOpen(false);
	// 	if (data) refresh({emit:true})
	// }
	// const onFabButton = props => {
	// 	// return setOpen(!open);
	// 	var props = {values:defaults, projects, onSubmit};
	// 	return navigator.pushPage({
	// 		content:TimeEntry,
	// 		key:props.values.id || props.values.date,
	// 		props,
	// 		title:'Time Entry',
	// 		animation:'lift',
	// 	})
	// }

	const onDeleteEntry = data => {
		ons.notification.confirm( {
			title: 'Delete item?',
			message: 'Are you sure you want to delete this?',
			buttonLabels: ['Delete', 'Cancel']
		})
		.then(function(button){
			if (button===0){
				// setLoading(true)
				ajax('del.times',data).then( data=>{
					// setLoading(false)
					if (!data.errors) onSubmit(true)
					else ons.notification.toast('An error occurred: '+data.errors,{timeout:5000})
					console.log(data)
				})
			}
		})
	}

	const onSelect = props => {
		console.log(props)	// props.values.id | props.values.date

		const rightButton = props.values.id ? <ToolbarButton onClick={e=>onDeleteEntry(props.values)}>Delete</ToolbarButton> : null

		return navigator.pushPage({
			content:TimeEntry,
			key:props.values.id || props.values.date,
			props,
			title:'Time Entry',
			hasBackButton:true,
			backButtonText:'Cancel',
			rightButton,
			animation:'lift',
		})
	}
	const editRow  = values => {onSelect({values,projects,onSubmit}); }
	const addRow   = values => {onSelect({values:{...defaults, project, date:values.date.fmt0},projects,onSubmit}) }

	const renderRow = (row,index) => {
		const entries = row.items.map(item => {
			const duration = getDuration(item), less = getLess(item)

			return <ListItem key={item.id} tappable onClick={e=>editRow(item)}>
				<div className='left'><Icon icon='calendar' /></div>
				<div className='center'>
					{item.start}-{item.finish} {duration}h <br/>
					{projectName(item.project)} {item.note}
				</div>
				<div className='right'>
					<Button modifier='quiet'><Icon icon='edit'/></Button>
				</div>
			</ListItem>
		})

		var month = row.date.name, type = row.date.date.getDay()%6 ? row.type : 'weekend'
		if (month.length>6) month = month.substr(0,3)
		return <Fragment key={row.date.day}>
			<ListItem tappable onClick={e=>addRow(row)}>
				<div className={cn('center', type )}>
					<strong>{row.date.date.getDayName().substr(0,3)} {row.date.day} {month}</strong>
				</div>
				<div className='right'><Button modifier='quiet' ><Icon icon='plus' /></Button></div>
			</ListItem>
			{entries}
		</Fragment>
	}

	return <Fragment>
		<TimesheetHeader timesheet={timesheet} total={total} />
		<Card>
			<List dataSource={days} renderRow={renderRow} />
		</Card>
	</Fragment>
")->props([id=>$id])
->listen('get.projects', function($data){ return Projects::getUserProjects($data); })
->style("
.visible-print { display:none !important; }
@media print {
	.visible-print { display:block; }
}
@media screen and (max-width: 800px) {
	.list-item {padding: 0;}
	.list-item__left {padding: 2px 0px 4px 0;}
	.list-item__right {padding: 12px 6px 12px 0;}
	.col-xs-1 {padding-left:6px;}
}
@media screen and (max-width: 480px) {
	.hidden-ss {display: none!important;}
}
@media all {
	.page-break	{ display: none; }
}
@media print {
	.page-break	{ display: block; page-break-before: always; }
	body {
		margin: 0; padding: 0; line-height: 1.4em; word-spacing: 1px; letter-spacing: 0.2px;
		font: 13px Arial, Helvetica,'Lucida Grande', serif; color: #000;
	}
	#print-btn #update-btn #nav-left #nav-bar, #selectUnitContainer, .navbar, .sidebar-nav {
		display: none;
	}
}
");
}
*/