/** @jsx React.DOM */
var React = require('react');
var pkg = require('./package.json');

var pouchdb = require('pouchdb')
var remoteCouch = false;

var tableid = "schema";

var db = new pouchdb('biosheets');

var tabledata = {
  cols: [
    {_id: "col/schema/recordid", table: "schema", type: "col", key: "recordid", label: "Record ID"}
  ],
  rows: [
    {_id: "row/schema/blahblah", table: "schema", type: "row",  recordid: "blahblah"}
  ]
}

var _ = require('underscore');
var uuid = require('node-uuid');

var handlers = {
}

db.info(function(err, info) { 
  db.changes({
    since: info.update_seq,
    continuous: true,
    include_docs: true,
    onChange: function(change) { 
      console.log(change)
      if (!change.deleted) {
        if(handlers[change.doc.table]) {
          if (change.doc.type == "row"){
            handlers[change.doc.table].addRow(change.doc);
          } else if (change.doc.type == "col"){
            handlers[change.doc.table].addCol(change.doc);
          }
        } else {
          console.log("no handle", change)
        }
      } else {
        handlers[change.id.split("/")[1]].init();
      }
    }
  });  
})

var TableControls = React.createClass({
  addCol: function(event) {
    var self = this;
    var colid = this.refs.colid.getDOMNode().value.trim();
    var collabel = this.refs.collabel.getDOMNode().value.trim();
    if (colid == "" || collabel == "") {
      return false;
    }    

    var d = {
      _id: "col/" + self.props.table + "/" + colid, 
      table: self.props.table,
      type: "col", 
      key: colid,
      label: collabel,
      editable: true,
      hidden: false
    }    

    db.put(d,function(err,doc){
      // console.log(err,doc);
    })
    return false
  },
  addRow: function(event) {
    var self = this;
    var u = uuid.v4();
    var d = {
      _id: "row/" + self.props.table + "/" + u,
      key: u,
      table: self.props.table,
      type: "row",
      recordid: u
    }

    db.put(d,function(err,doc){
      // console.log(err,doc);
    })
    return false
  },
  reset: function(event) {   
    var self = this;
    // "/".charCodeAt(0) => 47
    // String.fromCharCode(48) => "0"
    // "blah/..." >= "blah/" and "blah/..." =< "blah0"
    db.allDocs({ startkey: "col/" + self.props.table + "/", endkey: "col/" + self.props.table + "0"}, function(err,cols){
      _.each(cols.rows,function(col){
        if (col.id != "col/" + self.props.table + "/recordid") {
          db.remove({ _id: col.id, _rev: col.value.rev },function(err,doc){
            // console.log(col,err,doc);
          })
        }
      })
    })    
    db.allDocs({ startkey: "row/" + self.props.table + "/", endkey: "row/" + self.props.table + "0"}, function(err,rows){
      _.each(rows.rows,function(row){
        db.remove({ _id: row.id, _rev: row.value.rev },function(err,doc){
          // console.log(row,err,doc);
        })
      })
    })
    return false
  },  
  render: function() { 
    var self = this;
    return (
      <form id={self.props.table + "-controls"} className="form-inline" onSubmit={this.addCol}>
        ID: <input type="text" ref="colid"></input>
        Label: <input type="text" ref="collabel"></input>
        <input type="submit" className="btn btn-primary" value="Add Col"></input>
        <button className="btn btn-primary" onClick={this.addRow}>Add Row</button>
        <button className="btn btn-primary" onClick={this.reset}>Clear Table</button>
      </form>
    );
  }
});

var BioSheetRow = React.createClass({
  updateRow: _.debounce(function(){
    var self = this;
    var d = {};
    _.keys(self.refs).map(function(ref){
      d[ref] = self.refs[ref].getDOMNode().value.trim()
    })
    _.defaults(d,self.props.row);
    db.put(d,function(err,obj){
      console.log(err,obj);
    });
  }, 250),
  render: function(){
    var self = this;
    var cells = _.keys(self.props.cols).map(function (key) {
      var col = self.props.cols[key]
      var defval = ""
      if(self.props.row[col.key]) {
        defval = self.props.row[col.key];
      } 
      if (col.editable) {
        return (
          <td key={col.key}>
            <textarea ref={col.key} onChange={self.updateRow} defaultValue={defval}>
            </textarea>
          </td>
        );      
      } else {
        return (
          <td key={col.key}>
            {defval}
          </td>
        );        
      }
    });    
    return (
      <tr>
        {cells}
      </tr>
    );
  }
})

var BioSheet = React.createClass({
  getInitialState: function() {
    return {cols: {}, rows: {}};
  },
  componentWillMount: function() {
    var self = this;
    handlers[self.props.table] = {
      addRow: function(row){
        var newstate = { rows: self.state.rows };
        newstate.rows[row.key] = row;
        self.setState(newstate);
      },
      addCol: function(col) {
        var newstate = { cols: self.state.cols };
        newstate.cols[col.key] = col;
        self.setState(newstate);
      },
      init: _.debounce(function() {
        db.allDocs({ include_docs: true, startkey: "col/" + self.props.table + "/", endkey: "col/" + self.props.table + "0"}, function(err,objs){
          var cols = {};
          _.each(objs.rows,function(obj){
            cols[obj.doc.key] = obj.doc;
          })
          self.setState({ cols: cols })
        });   
        db.allDocs({ include_docs: true, startkey: "row/" + self.props.table + "/", endkey: "row/" + self.props.table + "0"}, function(err,objs){
          var rows = {};
          _.each(objs.rows,function(obj){
            rows[obj.doc.key] = obj.doc;
          })
          self.setState({ rows: rows })
        });
      },100)
    }
    handlers[self.props.table].init()
  },  
  render: function() {
    var self = this;
    var headings = _.keys(self.state.cols).map(function (key) {
      var col = self.state.cols[key];
      return <th key={col.key} id={"col-" + col.key}>{col.label}</th>;
    });
    var rows = _.keys(self.state.rows).map(function (key) {
      var row = self.state.rows[key];
      return <BioSheetRow table={self.props.table} key={row.key} cols={self.state.cols} row={row} />;
    });    
    return (
      <div>
        <TableControls table={this.props.table}/>
        <table className="table table-bordered">
          <thead>
            <tr>
              {headings}
            </tr>
          </thead>
          <tbody>
            {rows}
          </tbody>
        </table>
      </div>
    );
  }
})

var AppControls = React.createClass({
  addSheet: function(){
    var self = this;
    var sheetid = this.refs.sheetid.getDOMNode().value.trim();
    var sheetlabel = this.refs.sheetlabel.getDOMNode().value.trim();
    if (sheetid == "" || sheetlabel == "") {
      return false;
    }    
    self.props.addSheet({ key: sheetid, name: sheetlabel});
    return false;
  },
  render: function() { 
    var self = this;
    return (
      <form className="form-inline" onSubmit={self.addSheet}>
        ID: <input type="text" ref="sheetid"></input>
        Label: <input type="text" ref="sheetlabel"></input>
        <input type="submit" className="btn btn-primary" value="Add Sheet"></input>
      </form>
    );
  }
});

var App = React.createClass({
    getInitialState: function() {
      return {sheets: { schema: { key: "schema", name: "Schema" }}};
    },
    addSheet: function(sheet){
      var self = this;
      var newstate = { sheets: self.state.sheets };
      newstate.sheets[sheet.key] = sheet;
      self.setState(newstate);
      return false    
    },
    render: function() {
      var self = this;
      var sheetcount = 0;
      var sheets = _.keys(self.state.sheets).map(function(key){
        var table = self.state.sheets[key];
        var className = "tab-pane";
        if (sheetcount == 0){
          className += " active";
        }
        sheetcount += 1;
        return (
          <div key={"sheet" + key} className={className} id={key}>
            <BioSheet table={key} />
          </div>
        );
      })
      var tabcount = 0;
      var tabs = _.keys(self.state.sheets).map(function(key){
        var table = self.state.sheets[key];
        var className = "";
        if (tabcount == 0){
          className += "active";
        }
        tabcount += 1;        
        return (
          <li className={className} key={"tab"+key}>
            <a href={"#" + key} data-toggle="tab">{table.name}</a>
          </li>
        );
      })      
      return (
        <div>
          <AppControls addSheet={self.addSheet} />
          <ul className="nav nav-tabs">
            {tabs}
          </ul>
          <div className="tab-content">       
            {sheets}
          </div>
        </div>
      );
    }
});

React.renderComponent(<App />, document.body);