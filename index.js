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
      label: collabel
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
  render: function(){
    var self = this;
    var cells = self.props.cols.map(function (col) {
      if(self.props.row[col.key]) {
        return <td key={self.props.row.id + "/" + col.key}>{self.props.row[col.key]}</td>;
      } else {
        return <td key={self.props.row.id + "/" + col.key}></td>
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
    return {cols: [], rows: []};
  },
  componentWillMount: function() {
    var self = this;
    handlers[self.props.table] = {
      addRow: function(row){
        var state = self.state;
        var newstate = _.clone(state);
        newstate.rows.push(row);
        self.setState(newstate);
      },
      addCol: function(col) {
        var state = self.state;
        var newstate = _.clone(state);
        newstate.cols.push(col);
        self.setState(newstate);
      },
      init: _.debounce(function() {
        db.allDocs({ include_docs: true, startkey: "col/" + self.props.table + "/", endkey: "col/" + self.props.table + "0"}, function(err,objs){
          var cols = [];
          _.each(objs.rows,function(obj){
            cols.push(obj.doc);
          })
          self.setState({ cols: cols })
        });   
        db.allDocs({ include_docs: true, startkey: "row/" + self.props.table + "/", endkey: "row/" + self.props.table + "0"}, function(err,objs){
          var rows = [];
          _.each(objs.rows,function(obj){
            rows.push(obj.doc);
          })
          self.setState({ rows: rows })
        });
      },1)
    }
    handlers[self.props.table].init()
  },  
  render: function() {
    var self = this;
    var headings = self.state.cols.map(function (col) {
      return <th key={col.key} id={"col-" + col.key}>{col.label}</th>;
    });
    var rows = self.state.rows.map(function (row) {
      return <BioSheetRow table={self.props.table} key={row._id} cols={self.state.cols} row={row} />;
    });    
    return (
      <div>
        <TableControls table={this.props.table}/>
        <table className="table" id={this.props.table}>
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
    var sheetname = this.refs.sheetname.getDOMNode().value.trim();
    if (sheetname == "") {
      return false;
    }
    console.log(sheetname);
    return false;
  },
  render: function() { 
    var self = this;
    return (
      <form className="form-inline" onSubmit={self.addSheet}>
        Sheet Name: <input type="text" ref="sheetname"></input>
        <input type="submit" className="btn btn-primary" value="Add Sheet"></input>
      </form>
    );
  }
});

var App = React.createClass({
    render: function() {  
      return (
        <div>
          <AppControls />
          <BioSheet table={tableid}></BioSheet>
        </div>
      );
    }
});

React.renderComponent(<App />, document.body);