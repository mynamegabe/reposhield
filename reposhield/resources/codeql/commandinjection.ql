/**
 * @name Flask Command Injection
 * @description Detects potential command injection vulnerabilities in Flask applications.
 * @kind path-problem
 * @problem.severity error
 * @id python/flask-command-injection
 * @tags security
 * @precision high
 */

 import python
 import semmle.python.web.Flask
 import semmle.python.dataflow.TaintTracking
 import DataFlow::PathGraph
 
 class FlaskCommandInjection extends TaintTracking::Configuration {
   FlaskCommandInjection() {
     this = "Flask Command Injection"
   }
 
   override predicate isSource(DataFlow::Node source) {
     exists(Flask::RequestParamAccess access |
       source.asExpr() = access.getAnInput()
     )
   }
 
   override predicate isSink(DataFlow::Node sink) {
     exists(FunctionCall call |
       call.getTarget().getName().matches("%subprocess%") and
       (call.getTarget().getName() = "run" or call.getTarget().getName() = "Popen") and
       sink.asExpr() = call.getArgument(0)
     )
   }
 }
 
 from FlaskCommandInjection config, DataFlow::PathNode source, DataFlow::PathNode sink
 where config.hasFlowPath(source, sink)
 select sink, "Potential command injection vulnerability due to untrusted input."