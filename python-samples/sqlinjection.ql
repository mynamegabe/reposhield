/**
 * @name Flask SQL Injection
 * @description Detects potential SQL injection vulnerabilities in Flask applications.
 * @kind path-problem
 * @problem.severity error
 * @id python/flask-sql-injection
 * @tags security
 * @precision high
 */

 import python
 import semmle.python.web.Flask
 import semmle.python.dataflow.TaintTracking
 import DataFlow::PathGraph
 
 class FlaskSQLInjection extends TaintTracking::Configuration {
   FlaskSQLInjection() {
     this = "Flask SQL Injection"
   }
 
   override predicate isSource(DataFlow::Node source) {
     exists(Flask::RequestParamAccess access |
       source.asExpr() = access.getAnInput()
     )
   }
 
   override predicate isSink(DataFlow::Node sink) {
     exists(FunctionCall call |
       call.getTarget().getName() = "execute" and
       call.getTarget().getLibraryName().matches("%sqlite%") and
       sink.asExpr() = call.getArgument(0)
     )
   }
 }
 
 from FlaskSQLInjection config, DataFlow::PathNode source, DataFlow::PathNode sink
 where config.hasFlowPath(source, sink)
 select sink, "Potential SQL injection vulnerability due to untrusted input."